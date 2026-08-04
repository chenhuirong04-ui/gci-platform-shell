// api/_lib/inventoryCatalog.ts
// Single canonical reader for self-owned warehouse stock (Notion INVENTORY_DB +
// PRODUCT_MASTER), mirroring modules/trade/components/InventoryManager.tsx —
// the same component that renders /trade?tab=inventory.
//
// Every AI endpoint that answers "自有库存还剩多少" must read through this file
// instead of re-guessing Notion property names. Field names are hardcoded to
// match the real schema (see InventoryManager.mergeRows) on purpose: adaptive
// candidate-matching silently produced wrong numbers (formula-type 当前库存
// was skipped because it isn't a plain "number" property, and SKU only exists
// on PRODUCT_MASTER, not on INVENTORY_DB).
//
// Not used for: consignment_stock (Supabase) — that has its own reader in
// api/trade/check-inventory.ts and stays a separate, supplementary source.

const NOTION_BASE = 'https://api.notion.com/v1';
const INVENTORY_DB = '2c6d0b13b3b9806db227fc01f723bc40';
const PRODUCT_MASTER_DB = '2bfd0b13b3b980da819fd1dbea638c81';

export interface InventoryCatalogRow {
  invPageId: string;
  productPageId: string;
  name: string;        // CN name (PRODUCT_MASTER), falls back to INVENTORY 名称
  nameEN: string;       // INVENTORY 名称 (title)
  sku: string;
  currentQty: number;   // 当前库存 — Notion formula, defaults to 0 (matches page display)
  initQty: number;
  unit: string;
  warehouse: string;
  costPrice: number;
  wholesale: number;
  category: string;
  brand: string;
  stockStatus: string;
  updatedAt: string;
}

async function fetchPaged(token: string, dbId: string): Promise<any[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  const results: any[] = [];
  let cursor: string | undefined;
  let loops = 0;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_BASE}/databases/${dbId}/query`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion query failed (${dbId}): ${res.status}`);
    const data = await res.json();
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
    loops++;
    if (loops > 10) break; // safety cap: 1000 rows
  } while (cursor);
  return results;
}

const txt = (p: any) => p?.rich_text?.[0]?.plain_text || p?.title?.[0]?.plain_text || '';
const num = (p: any) => p?.number ?? p?.formula?.number ?? 0;
const sel = (p: any) => p?.select?.name || '';

export async function fetchInventoryCatalog(token: string): Promise<InventoryCatalogRow[]> {
  const [invRows, masterRows] = await Promise.all([
    fetchPaged(token, INVENTORY_DB),
    fetchPaged(token, PRODUCT_MASTER_DB),
  ]);
  const masterMap = new Map(masterRows.map(m => [m.id, m]));

  const rows: (InventoryCatalogRow | null)[] = invRows.map(inv => {
    const ip = inv.properties;
    const relId = ip['产品名称']?.relation?.[0]?.id || '';
    const master = relId ? masterMap.get(relId) : undefined;
    const mp = master?.properties || {};

    const nameEN = txt(ip['名称']);
    if (!nameEN && !relId) return null; // skip truly empty rows

    const nameCN =
      mp['产品名称']?.rich_text?.[0]?.plain_text ||
      mp['Product Master（产品主库）']?.title?.[0]?.plain_text ||
      nameEN;

    const sku =
      mp['SKU ']?.rich_text?.[0]?.plain_text ||
      ip['SKU ']?.rollup?.array?.[0]?.rich_text?.[0]?.plain_text ||
      '';

    return {
      invPageId: inv.id,
      productPageId: relId,
      name: nameCN,
      nameEN,
      sku,
      currentQty: num(ip['当前库存']),
      initQty: ip['初始库存']?.number ?? 0,
      unit: sel(ip['单位']) || txt(mp['Selling Unit（销售单位）']) || 'PCS',
      warehouse: sel(ip['仓库']) || 'Dubai',
      costPrice: num(mp['Cost Price AED']),
      wholesale: num(mp['Target Wholesale']),
      category: sel(mp['产品类别 Type']) || '',
      brand: txt(mp['Brand（品牌）']),
      stockStatus: sel(mp['Stock Status']) || '',
      updatedAt: inv.last_edited_time || '',
    };
  });

  return rows.filter((r): r is InventoryCatalogRow => r !== null);
}
