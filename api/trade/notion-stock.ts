import type { VercelRequest, VercelResponse } from '@vercel/node';

const INVENTORY_DB = "2c6d0b13b3b9806db227fc01f723bc40";
const STOCK_LEDGER_DB = "2c6d0b13b3b9804f9ccff92be2566c30";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'Server misconfigured: NOTION_TOKEN is not set' });

  const { soNo, items, mode, customerName } = req.body;
  if (!soNo || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing soNo or items' });
  }
  const isConsignment = mode === 'Consignment';
  const moveType      = isConsignment ? '寄售出库' : '销售出库';

  // ── Duplicate guard: if this SO already has STOCK_LEDGER entries, block write ──
  try {
    const dupCheck = await fetch(`https://api.notion.com/v1/databases/${STOCK_LEDGER_DB}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filter: { property: "来源单据编号", rich_text: { equals: soNo } },
        page_size: 1
      })
    });
    const dupData = await dupCheck.json();
    if (dupData.results && dupData.results.length > 0) {
      console.warn(`[notion-stock] BLOCKED duplicate write for SO: ${soNo}`);
      return res.status(409).json({
        error: `Duplicate blocked: SO ${soNo} already has stock ledger entries.`,
        existing: dupData.results[0].id
      });
    }
  } catch (e) {
    // If the dedup check itself fails, log and proceed (don't block the legitimate first write)
    console.error('[notion-stock] Dedup check failed, proceeding:', e);
  }

  const results = [];

  for (const item of items) {
    let inventoryPageId: string | null = null;
    try {
      // Prefer productId-based relation lookup (reliable); fall back to name search only if no productId
      const filter = item.productId
        ? { property: "产品名称", relation: { contains: item.productId } }
        : { property: "名称", title: { contains: item.desc.substring(0, 15) } };
      const searchRes = await fetch(`https://api.notion.com/v1/databases/${INVENTORY_DB}/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ filter, page_size: 1 })
      });
      const searchData = await searchRes.json();
      if (searchData.results?.length > 0) inventoryPageId = searchData.results[0].id;
    } catch (e) {}

    const body: any = {
      parent: { database_id: STOCK_LEDGER_DB },
      properties: {
        "自动库存流水": { title: [{ text: { content: `${soNo} - ${item.desc}` } }] },
        "变动数量": { number: -Math.abs(item.qty) },
        "变动类型": { select: { name: moveType } },
        "来源单据类型": { rich_text: [{ text: { content: isConsignment ? "Consignment Order" : "Sales Order" } }] },
        "来源单据编号": { rich_text: [{ text: { content: soNo } }] },
        "日期": { date: { start: new Date().toISOString().split("T")[0] } },
        "仓库": { select: { name: "Dubai" } },
        "操作人": { select: { name: isConsignment && customerName ? `寄→${customerName}` : "Chris" } }
      }
    };

    if (inventoryPageId) body.properties["当前库存"] = { relation: [{ id: inventoryPageId }] };
    if (item.productId) body.properties["产品名称"] = { relation: [{ id: item.productId }] };

    const writeRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    results.push({ desc: item.desc, ok: writeRes.ok });
  }

  res.status(200).json({ results });
}
