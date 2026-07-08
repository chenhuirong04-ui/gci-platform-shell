// /api/ai/product-overview
// GET ?product=xxx
// Reads four sources in parallel (Promise.allSettled — partial failure is OK):
//   A. Notion PRODUCT_MASTER  — standard product info + price fields
//   B. Notion INVENTORY_DB    — current stock quantities only (NO price)
//   C. Supabase consignment_stock — consignment batch remaining (NOT standard price)
//   D. Supabase quotation_items JOIN quotation_records — historical quote prices
//
// Price clarification:
//   costPriceAED    = internal cost from PRODUCT_MASTER (internal reference)
//   targetWholesale = suggested wholesale price from PRODUCT_MASTER
//   consignment unitPrice = price for that specific batch — NOT the standard price
//   quotation selling_price = historical price quoted to a customer
export const config = { runtime: 'edge' };

const PRODUCT_MASTER_DB = '2bfd0b13b3b980da819fd1dbea638c81';
const INVENTORY_DB      = '2c6d0b13b3b9806db227fc01f723bc40';
const NOTION_BASE       = 'https://api.notion.com/v1';
const LOW_STOCK_THRESHOLD = 10;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Notion property extractors ──────────────────────────────────────────────
function nTitle(page: any, field: string): string {
  const p = page?.properties?.[field];
  if (!p) return '';
  if (p.type === 'title')     return (p.title     || []).map((t: any) => t.plain_text || '').join('');
  if (p.type === 'rich_text') return (p.rich_text || []).map((t: any) => t.plain_text || '').join('');
  return '';
}
function nText(page: any, field: string): string {
  const p = page?.properties?.[field];
  if (!p) return '';
  if (p.type === 'rich_text') return (p.rich_text || []).map((t: any) => t.plain_text || '').join('');
  if (p.type === 'title')     return (p.title     || []).map((t: any) => t.plain_text || '').join('');
  if (p.type === 'select')    return p.select?.name || '';
  return '';
}
function nNum(page: any, field: string): number | null {
  const p = page?.properties?.[field];
  if (!p) return null;
  if (p.type === 'number' && p.number != null) return p.number;
  if (p.type === 'formula') {
    if (p.formula?.type === 'number' && p.formula.number != null) return p.formula.number;
  }
  return null;
}
function nSel(page: any, field: string): string {
  const p = page?.properties?.[field];
  if (!p) return '';
  if (p.type === 'select')       return p.select?.name || '';
  if (p.type === 'multi_select') return (p.multi_select || []).map((s: any) => s.name).join(', ');
  return '';
}
function nRelId(page: any, field: string): string {
  return page?.properties?.[field]?.relation?.[0]?.id || '';
}

// Paginated Notion query — up to 200 results (2 pages)
async function queryNotion(
  dbId: string,
  filter: any,
  headers: Record<string, string>,
): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  let loops = 0;
  do {
    const body: any = { page_size: 100, filter };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_BASE}/databases/${dbId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text().catch(() => '')}`);
    const data = await res.json();
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
    loops++;
  } while (cursor && results.length < 200 && loops < 3);
  return results;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

  const notionToken  = process.env.NOTION_TOKEN;
  const supabaseUrl  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const reqUrl  = new URL(request.url);
  const keyword = reqUrl.searchParams.get('product')?.trim() || '';

  if (!keyword) {
    return json({ ok: false, error: '请提供产品关键词：?product=xxx' }, 400);
  }

  const kw = keyword.toLowerCase();

  // Detect project / custom query — adjust display guidance
  const isProjectQuery = /villa|project|boq|fitout|工程|装修|定制|家具项目/i.test(keyword);

  const notionHeaders: Record<string, string> = {
    Authorization:    `Bearer ${notionToken || ''}`,
    'Notion-Version': '2022-06-28',
    'Content-Type':   'application/json',
  };
  const supaHeaders: Record<string, string> = {
    apikey:        supabaseKey || '',
    Authorization: `Bearer ${supabaseKey || ''}`,
    'Content-Type': 'application/json',
  };

  const warnings: string[] = [];

  // ── Run all four sources in parallel ──────────────────────────────────────
  const [masterRes, invRes, csRes, qiRes] = await Promise.allSettled([

    // A. PRODUCT_MASTER — filter by any of the four name/SKU fields
    notionToken
      ? queryNotion(PRODUCT_MASTER_DB, {
          or: [
            { property: 'Product Master（产品主库）', title:     { contains: keyword } },
            { property: '产品名称',                  rich_text: { contains: keyword } },
            { property: 'Product Name (EN)',          rich_text: { contains: keyword } },
            { property: 'SKU ',                      rich_text: { contains: keyword } },
          ],
        }, notionHeaders)
      : Promise.reject(new Error('NOTION_TOKEN 未配置')),

    // B. INVENTORY_DB — search by English name (title field "名称")
    notionToken
      ? queryNotion(INVENTORY_DB, {
          property: '名称',
          title: { contains: keyword },
        }, notionHeaders)
      : Promise.reject(new Error('NOTION_TOKEN 未配置')),

    // C. consignment_stock — fetch active rows, filter in memory by productName
    supabaseUrl && supabaseKey
      ? (async () => {
          const url = `${supabaseUrl}/rest/v1/consignment_stock`
            + `?select=id,payload&state=eq.active&order=created_at.desc&limit=300`;
          const res = await fetch(url, { headers: supaHeaders });
          if (!res.ok) throw new Error(`Supabase ${res.status}`);
          const rows: any[] = await res.json();
          return rows
            .map(r => r.payload)
            .filter(p => p && (p.productName || '').toLowerCase().includes(kw));
        })()
      : Promise.reject(new Error('Supabase 未配置')),

    // D. quotation_items — search by item_name OR description, then JOIN records
    supabaseUrl && supabaseKey
      ? (async () => {
          const enc = encodeURIComponent(keyword);
          const qiUrl = `${supabaseUrl}/rest/v1/quotation_items`
            + `?or=(item_name.ilike.*${enc}*,description.ilike.*${enc}*)`
            + `&select=quotation_id,item_name,description,qty,unit,selling_price,line_total,currency,item_notes,sort_order`
            + `&order=sort_order.asc`
            + `&limit=50`;
          const qiRes = await fetch(qiUrl, { headers: supaHeaders });
          if (!qiRes.ok) throw new Error(`Supabase quotation_items ${qiRes.status}`);
          const items: any[] = await qiRes.json();
          if (items.length === 0) return { items: [], recordMap: {} };

          // Batch-fetch quotation_records for all returned quotation_ids
          const ids = [...new Set(items.map((i: any) => i.quotation_id).filter(Boolean))];
          if (ids.length === 0) return { items, recordMap: {} };

          const qrUrl = `${supabaseUrl}/rest/v1/quotation_records`
            + `?id=in.(${ids.join(',')})`
            + `&select=id,quote_no,customer_name,project_name,quote_date,quote_type,status`
            + `&order=quote_date.desc`;
          const qrRes = await fetch(qrUrl, { headers: supaHeaders });
          if (!qrRes.ok) throw new Error(`Supabase quotation_records ${qrRes.status}`);
          const records: any[] = await qrRes.json();
          const recordMap: Record<string, any> = {};
          for (const r of records) recordMap[r.id] = r;
          return { items, recordMap };
        })()
      : Promise.reject(new Error('Supabase 未配置')),
  ]);

  // ── A. Process PRODUCT_MASTER ─────────────────────────────────────────────
  let productMaster: { found: boolean; items: any[] } = { found: false, items: [] };
  if (masterRes.status === 'fulfilled') {
    const pages: any[] = masterRes.value;
    productMaster = {
      found: pages.length > 0,
      items: pages.map(page => {
        const titleField = nTitle(page, 'Product Master（产品主库）');
        const zhField    = nText(page, '产品名称');
        return {
          pageId:          page.id,
          productName:     titleField || zhField,
          productNameZh:   zhField,
          productNameEn:   nText(page, 'Product Name (EN)'),
          sku:             nText(page, 'SKU '),          // trailing space is intentional
          category:        nSel(page,  '产品类别 Type'),
          brand:           nText(page, 'Brand（品牌）'),
          costPriceAED:    nNum(page,  'Cost Price AED'),
          targetWholesale: nNum(page,  'Target Wholesale'),
          sellingUnit:     nText(page, 'Selling Unit（销售单位）') || nSel(page, '单位'),
          stockStatus:     nSel(page,  'Stock Status'),
          _priceNote: {
            costPriceAED:    '成本价（内部参考）',
            targetWholesale: '建议批发价 / 目标售价',
          },
        };
      }),
    };
  } else {
    warnings.push(`产品主库查询失败：${(masterRes as PromiseRejectedResult).reason?.message || '未知'}`);
  }

  // ── B. Process INVENTORY_DB ───────────────────────────────────────────────
  const masterPageIds = new Set(productMaster.items.map((p: any) => p.pageId));
  let inventory: { found: boolean; items: any[] } = { found: false, items: [] };
  if (invRes.status === 'fulfilled') {
    const pages: any[] = invRes.value;
    // Include pages whose relation matches any PRODUCT_MASTER result
    // (additional inventory rows that share a PRODUCT_MASTER page ID)
    const masterRelIds = new Set<string>(
      pages.map(p => nRelId(p, '产品名称')).filter(Boolean)
    );
    const unmatchedMasterIds = productMaster.items
      .map((m: any) => m.pageId)
      .filter((id: string) => !masterRelIds.has(id));

    inventory = {
      found: pages.length > 0,
      items: pages.map(page => {
        const qty = nNum(page, '当前库存');
        let alertType: 'outOfStock' | 'lowStock' | 'anomaly' | 'normal';
        if (qty === null || isNaN(qty as number)) alertType = 'anomaly';
        else if ((qty as number) <= 0) alertType = 'outOfStock';
        else if ((qty as number) <= LOW_STOCK_THRESHOLD) alertType = 'lowStock';
        else alertType = 'normal';

        const productRelId = nRelId(page, '产品名称');
        return {
          pageId:            page.id,
          productRelId,
          linkedToMaster:    masterPageIds.has(productRelId),
          nameEN:            nTitle(page, '名称'),
          currentQty:        qty,
          warehouse:         nSel(page, '仓库')  || 'Dubai',
          unit:              nSel(page, '单位')  || 'PCS',
          alertType,
          outOfStock:        alertType === 'outOfStock',
          lowStock:          alertType === 'lowStock',
          _note:             '库存数量 — 价格请参考产品主库或历史报价',
        };
      }),
    };
    if (unmatchedMasterIds.length > 0) {
      warnings.push(`产品主库中有 ${unmatchedMasterIds.length} 个匹配产品未在库存表中找到对应行（可能名称不一致）`);
    }
  } else {
    warnings.push(`库存查询失败：${(invRes as PromiseRejectedResult).reason?.message || '未知'}`);
  }

  // ── C. Process consignment_stock ──────────────────────────────────────────
  let consignment: { found: boolean; items: any[] } = { found: false, items: [] };
  if (csRes.status === 'fulfilled') {
    const rows: any[] = csRes.value;
    consignment = {
      found: rows.length > 0,
      items: rows.map(r => ({
        productName:      (r.productName || '').trim(),
        customerName:     r.customerName || '',
        soNo:             r.soNo         || '',
        remainingQty:     r.remainingQty != null ? Number(r.remainingQty) : null,
        consignedQty:     Number(r.consignedQty) || 0,
        soldQty:          Number(r.soldQty)      || 0,
        settlementStatus: r.settlementStatus     || '',
        unitPrice:        r.unitPrice ? Number(r.unitPrice) : null,
        // IMPORTANT: unitPrice is the price for this specific consignment batch,
        // NOT the product standard selling price.
        unitPriceNote:    '寄售批次价格 — 不等于产品主库标准价',
      })),
    };
  } else {
    warnings.push(`寄售库存查询失败：${(csRes as PromiseRejectedResult).reason?.message || '未知'}`);
  }

  // ── D. Process quotation history ──────────────────────────────────────────
  let quotationHistory: {
    found: boolean; total: number; items: any[];
    priceSummary: { latestPrice: number | null; minPrice: number; maxPrice: number; avgPrice: number; quoteCount: number } | null;
  } = { found: false, total: 0, items: [], priceSummary: null };

  if (qiRes.status === 'fulfilled') {
    const { items: qItems, recordMap } = qiRes.value as any;
    const enriched: any[] = qItems.map((it: any) => {
      const rec = recordMap[it.quotation_id] || {};
      return {
        item_name:     it.item_name     || '',
        description:   it.description   || '',
        qty:           Number(it.qty)   || 0,
        unit:          it.unit          || '',
        selling_price: Number(it.selling_price) || 0,
        line_total:    Number(it.line_total)    || 0,
        currency:      it.currency      || 'AED',
        item_notes:    it.item_notes    || '',
        quotation_id:  it.quotation_id,
        customer_name: rec.customer_name  || '',
        project_name:  rec.project_name   || '',
        quote_date:    rec.quote_date     || '',
        quote_no:      rec.quote_no       || '',
        quote_type:    rec.quote_type     || '',
        status:        rec.status         || '',
      };
    });

    // Sort by quote_date descending
    enriched.sort((a: any, b: any) =>
      (b.quote_date || '').localeCompare(a.quote_date || '')
    );

    // Price summary — only rows with a valid selling_price
    const prices = enriched
      .map((it: any) => it.selling_price)
      .filter((p: number) => p > 0);

    const priceSummary = prices.length > 0 ? {
      latestPrice: enriched.find((it: any) => it.selling_price > 0)?.selling_price ?? null,
      minPrice:    Math.min(...prices),
      maxPrice:    Math.max(...prices),
      avgPrice:    Math.round(
        (prices.reduce((s: number, p: number) => s + p, 0) / prices.length) * 100
      ) / 100,
      quoteCount: enriched.length,
    } : null;

    quotationHistory = {
      found:        enriched.length > 0,
      total:        enriched.length,
      items:        enriched,
      priceSummary,
    };
  } else {
    warnings.push(`历史报价查询失败：${(qiRes as PromiseRejectedResult).reason?.message || '未知'}`);
  }

  return json({
    ok:             true,
    productKeyword: keyword,
    source:         'mixed',
    isRealData:     true,
    isProjectQuery,
    projectQueryNote: isProjectQuery
      ? '这是项目/定制类查询，产品主库价格可能不适用，请以历史项目报价和实际规格核算为准。'
      : null,
    productMaster,
    inventory,
    consignment,
    quotationHistory,
    warnings,
    priceClarification: {
      standard:    '建议批发价（Target Wholesale）来自产品主库，是与客户报价的参考起点。',
      cost:        '成本价（Cost Price AED）来自产品主库，属内部参考，不对客户披露。',
      consignment: '寄售批次价格（unitPrice）是某一批次寄售的单价，不等于产品主库标准价。',
      historical:  '历史报价单价（selling_price）是以往向客户报价时的实际单价，仅供参考。',
      reminder:    '可参考产品主库建议批发价和历史报价区间，最终报价需人工确认。',
    },
    asOf: new Date().toISOString(),
  });
}
