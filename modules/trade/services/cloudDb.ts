/**
 * iCare Cloud DB (Supabase Version)
 * Drop-in replacement for the old Google Apps Script cloudDb.
 *
 * FIX (stable quotes write):
 * - DO NOT send business id into uuid column `id`
 * - Let Postgres default uuid_generate_v4() generate `id`
 * - Keep your business doc no inside payload (e.g. payload.id / payload.doc_no)
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./runtimeConfig";

type AnyRow = Record<string, any>;

let _loggedOnce = false;
function maskKey(k?: string) {
  if (!k) return "MISSING";
  return k.length <= 12 ? k : `${k.slice(0, 12)}...${k.slice(-4)}`;
}
function logRuntimeOnce() {
  if (_loggedOnce) return;
  _loggedOnce = true;
  console.log("[cloudDb runtime]", "URL =", SUPABASE_URL, "KEY =", maskKey(SUPABASE_ANON_KEY));
}

function hasConfig(): boolean {
  logRuntimeOnce();

  const urlOk = !!SUPABASE_URL && SUPABASE_URL.includes("supabase.co");
  const keyOk =
    !!SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY.trim() !== "" &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

  if (!urlOk) {
    console.warn("[cloudDb] Invalid SUPABASE_URL. Cloud disabled.");
    return false;
  }
  if (!keyOk) {
    console.warn("[cloudDb] Supabase key missing/placeholder. Cloud disabled.");
    return false;
  }
  return true;
}

async function sbFetch(path: string, init: RequestInit = {}) {
  if (!hasConfig()) return null;

  const url = `${SUPABASE_URL}${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers as any),
  };

  try {
    const res = await fetch(url, { ...init, headers });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[cloudDb] ${res.status} ${res.statusText} :: ${txt}`);
      return null;
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return res.json();
  } catch (e) {
    console.error("[cloudDb] Network error:", e);
    return null;
  }
}

/** Convert query params into PostgREST filters */
function buildFilters(params: AnyRow = {}) {
  const p = { ...(params || {}) };

  const orderBy = p.orderBy as string | undefined;
  const order = (p.order as string | undefined) || "desc";
  delete p.orderBy;
  delete p.order;

  const filters: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === "") continue;

    // special: allow state filter
    if (Array.isArray(v)) {
      const list = v.map((x) => encodeURIComponent(String(x))).join(",");
      filters.push(`${encodeURIComponent(k)}=in.(${list})`);
    } else {
      filters.push(`${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`);
    }
  }

  return { filters, orderBy, order };
}

/**
 * Generate a deterministic UUID from a business ID string.
 * Same input → same UUID → on_conflict=id correctly triggers UPDATE instead of INSERT.
 * Uses two independent djb2-variant hashes for 64 bits of entropy.
 */
function stableUuid(seed: string): string {
  let a = 0x9e3779b9 >>> 0;
  let b = 0x6c62272e >>> 0;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    a = (Math.imul(a ^ c, 0x45d9f3b) >>> 0) ^ (a >>> 16);
    b = (Math.imul(b ^ c, 0x119de1f3) >>> 0) ^ (b >>> 13);
  }
  const p = (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).padEnd(32, '0');
  // UUID format 8-4-4-4-12, force version=4 and variant=8
  return `${p.slice(0,8)}-${p.slice(8,12)}-4${p.slice(13,16)}-8${p.slice(17,20)}-${p.slice(20,32)}`;
}

/**
 * Wrap any business row into the fixed schema:
 * { id, created_at, updated_at, state, payload }
 *
 * id is derived deterministically from the business id (r.id / r.soNo / r.doc_no).
 * This ensures upsert with on_conflict=id correctly UPDATE existing rows
 * instead of always INSERTing new ones.
 */
function wrapRow(r: AnyRow) {
  // Derive a stable UUID from the business key so on_conflict=id deduplicates correctly.
  // Priority: payload.id (SO-xxx / PAY-xxx / DOC-xxx) → payload.soNo → undefined (new row)
  const businessKey = (r.id || r.soNo || r.doc_no) as string | undefined;
  const id = businessKey ? stableUuid(businessKey) : undefined;

  const created_at = r.created_at ?? new Date().toISOString();
  const updated_at = r.updated_at ?? new Date().toISOString();
  const state = r.state ?? "active";

  // payload stores the full original business object (including business id/doc_no)
  const payload = { ...r };

  return { id, created_at, updated_at, state, payload };
}

export const cloudDb = {
  /** Insert or update multiple rows */
  async upsert(table: string, rows: AnyRow[]): Promise<void> {
    if (!rows || rows.length === 0 || !hasConfig()) return;

    const wrapped = rows.map(wrapRow);

    // keep existing behavior; DB will generate uuid when id is omitted/undefined
    const path = `/rest/v1/${encodeURIComponent(table)}?on_conflict=id`;

    await sbFetch(path, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(wrapped),
    });
  },

  /** Query records */
  async query(table: string, limit = 500, offset = 0, params: AnyRow = {}): Promise<any[]> {
    if (!hasConfig()) return [];

    const { filters, orderBy, order } = buildFilters(params);

    const orderExpr = orderBy
      ? `${encodeURIComponent(orderBy)}.${encodeURIComponent(order)}`
      : `updated_at.desc`;

    const qs: string[] = [
      "select=*",
      `order=${orderExpr}`,
      `limit=${Math.max(0, limit)}`,
      `offset=${Math.max(0, offset)}`,
    ];
    qs.push(...filters);

    const path = `/rest/v1/${encodeURIComponent(table)}?${qs.join("&")}`;

    const data = await sbFetch(path, { method: "GET" });
    return Array.isArray(data) ? data : [];
  },

  /** Remove records by IDs */
  async remove(table: string, ids: string[]): Promise<void> {
    if (!ids || ids.length === 0 || !hasConfig()) return;

    const list = ids.map((x) => encodeURIComponent(String(x))).join(",");
    const path = `/rest/v1/${encodeURIComponent(table)}?id=in.(${list})`;

    await sbFetch(path, { method: "DELETE" });
  },

  /** Export all records */
  async exportAll(table: string): Promise<any[]> {
    if (!hasConfig()) return [];

    const limit = 500;
    let offset = 0;
    let all: any[] = [];

    while (true) {
      const batch = await this.query(table, limit, offset);
      if (!batch || batch.length === 0) break;
      all = all.concat(batch);
      if (batch.length < limit) break;
      offset += limit;
    }
    return all;
  },
};
// ✅ 销售后自动扣减库存 — 写入库存流水表
export async function createStockLedgerEntry(
  notionToken: string,
  stockLedgerDbId: string,  // 库存流水表 Database ID
  inventoryPageId: string,   // 对应库存表的那一行的 Page ID
  productPageId: string,     // 产品的 Page ID
  quantity: number,          // 销售数量（正数，函数内部自动变负数）
  saleNumber: string,        // 销售单号
  operator: string = 'System'
): Promise<void> {
  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: stockLedgerDbId },
      properties: {
        // 关联库存表（这条流水属于哪个产品的库存）
        'stock Ledger(库存流水表）': {
          relation: [{ id: inventoryPageId }]
        },
        // 变动数量：负数代表出库
        '变动数量': { number: -Math.abs(quantity) },
        // 变动类型
        '变动类型': { select: { name: '销售出库' } },
        // 来源单据类型
        '来源单据类型': { 
          rich_text: [{ text: { content: '销售单' } }] 
        },
        // 来源单据编号
        '来源单据编号': { 
          rich_text: [{ text: { content: saleNumber } }] 
        },
        // 日期
        '日期': { 
          date: { start: new Date().toISOString().split('T')[0] } 
        },
        // 操作人
        '操作人': { 
          rich_text: [{ text: { content: operator } }] 
        },
      }
    })
  });
}
