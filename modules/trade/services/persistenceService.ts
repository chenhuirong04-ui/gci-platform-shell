import type {
  QuoteRecord,
  QuoteItemRecord,
  OrderRecord,
  OrderItemRecord,
  PaymentRecord,
  TransactionRecord,
  ConsignmentStockRecord
} from '../types';
import { cloudDb } from './cloudDb';

/**
 * iCare Persistence Layer - Cloud Row Sync
 * Signature is 100% preserved.
 */

const APP_ID = 'icar_bookkeeping';

const getLocal = (key: string) => JSON.parse(localStorage.getItem(`${APP_ID}_${key}`) || '[]');
const setLocal = (key: string, data: any) => localStorage.setItem(`${APP_ID}_${key}`, JSON.stringify(data));

/**
 * Normalize Supabase row:
 * { id: uuid, created_at, updated_at, payload: {...business...}, state }
 * -> plain business record used by UI.
 *
 * IMPORTANT:
 * - Business id lives in payload.id (DOC-... / SO-... / PAY-...)
 * - NEVER replace payload.id with uuid row.id unless payload.id is missing.
 */
const normalizeCloudRow = (row: any) => {
  const payload = row?.payload ?? row ?? {};
  const rowCreated = row?.created_at ?? new Date().toISOString();
  const rowUpdated = row?.updated_at ?? rowCreated;

  const payloadCreated = payload?.created_at ?? payload?.createdAt;
  const payloadUpdated = payload?.updated_at ?? payload?.updatedAt;

  const created_at = payloadCreated ?? rowCreated;
  const updated_at = payloadUpdated ?? rowUpdated;

  // Business id priority: payload.id first, fallback to row.id (uuid)
  const businessId = payload?.id ?? row?.id;

  return {
    ...payload,
    id: businessId,
    // Real Postgres row id (Finance V1 fix, 2026-09) — lets a later targeted
    // update (cloudDb.updateById) hit exactly this physical row instead of
    // guessing an id and upserting, which is what caused the duplicate-row
    // bug. Whichever physical row wins mergeById's "latest updated_at"
    // dedup carries its own _rowId forward, so updates keep landing on the
    // row the app is already treating as current.
    _rowId: row?.id,
    // Preserve row-level state so cancelled/archived records can be filtered out
    state: row?.state ?? 'active',

    // Keep both snake_case and camelCase so old UI code won't break
    created_at,
    updated_at,
    createdAt: payload?.createdAt ?? payload?.created_at ?? rowCreated,
    updatedAt: payload?.updatedAt ?? payload?.updated_at ?? rowUpdated
  };
};

const sortByCreatedDesc = (arr: any[]) => {
  return (arr || []).sort((a: any, b: any) => {
    const ta = (a?.createdAt || a?.created_at || '') as string;
    const tb = (b?.createdAt || b?.created_at || '') as string;
    return (tb || '').localeCompare(ta || '');
  });
};

const mergeById = <T extends { id: string }>(cloudArr: T[], localArr: T[]) => {
  // Strategy:
  // - Keep anything only in local (draft/offline)
  // - Cloud overwrites local when same id exists (cloud wins)
  // - cloudArr comes from exportAll() sorted updated_at DESC (newest first).
  //   If the same business ID has duplicate rows in Supabase (caused by upsert
  //   inserting instead of updating), we must process cloud in REVERSE order so
  //   the newest row is written last and wins the map slot.
  const map = new Map<string, T>();

  for (const item of (localArr || [])) {
    if (item?.id) map.set(item.id, item);
  }
  // Reverse so oldest is processed first, newest is written last → newest wins
  const cloudNewestLast = [...(cloudArr || [])].reverse();
  for (const item of cloudNewestLast) {
    if (item?.id) map.set(item.id, item);
  }

  return Array.from(map.values());
};

const enrichRecord = (item: any) => {
  const enriched = { ...item };

  // Do NOT overwrite business id if already present
  if (!enriched.id) {
    enriched.id =
      (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  const now = new Date().toISOString();

  // Keep both createdAt/created_at
  if (!enriched.created_at && !enriched.createdAt) {
    enriched.created_at = now;
    enriched.createdAt = now;
  } else {
    if (!enriched.created_at) enriched.created_at = enriched.createdAt;
    if (!enriched.createdAt) enriched.createdAt = enriched.created_at;
  }

  enriched.updated_at = now;
  enriched.updatedAt = now;

  return enriched;
};

/**
 * Shared safe-write path for updateOrder/updatePayment/updateQuote
 * (Finance V1 fix, 2026-09).
 *
 * When the record already carries a `_rowId` (the normal case for anything
 * touched since this fix), this is a plain PATCH — no lookup needed.
 *
 * When it doesn't (a record cached before this fix, or one whose insert
 * response never made it back), this used to fall back to a single-row
 * `upsert()` with a guessed id — which could still insert a NEW duplicate
 * physical row for THIS record if the guess didn't match. That fallback is
 * gone. Instead:
 *   1. Look up the real row(s) for this business id.
 *   2. Exactly one match → PATCH it.
 *   3. More than one match → an old duplicate already exists from before
 *      this fix. Refuse to guess which one is "right" — do NOT write to
 *      cloud, just warn. No new row is ever created in this case.
 *   4. No match → this business id genuinely doesn't exist in the table
 *      yet, so a single INSERT is the correct action, not a guess.
 * In every branch, at most one physical row is ever created or touched.
 */
const safeWriteRow = async (table: string, enriched: any, knownRowId?: string): Promise<string | undefined> => {
  if (knownRowId) {
    try {
      await cloudDb.updateById(table, knownRowId, enriched);
    } catch (e) {
      console.warn(`[persistence] Cloud update failed for ${table}:`, e);
    }
    return knownRowId;
  }

  try {
    const resolved = await cloudDb.resolveRowId(table, enriched.id);
    if (resolved.status === 'found') {
      await cloudDb.updateById(table, resolved.rowId, enriched);
      return resolved.rowId;
    }
    if (resolved.status === 'ambiguous') {
      console.warn(
        `[persistence] ${table}: business id "${enriched.id}" already has ${resolved.rowIds.length}+ physical rows ` +
        `(${resolved.rowIds.join(', ')}) — refusing to guess which one to update. Cloud was NOT changed for this ` +
        `edit; this record has a pre-existing duplicate from before the Finance V1 fix and needs manual cleanup.`
      );
      return undefined;
    }
    // not_found — this business id has no row yet, so creating one is
    // correct, not a guess.
    const inserted = await cloudDb.insertOne(table, enriched);
    return inserted?.id;
  } catch (e) {
    console.warn(`[persistence] Cloud update failed for ${table}:`, e);
    return undefined;
  }
};

let isHydrated = false;

/**
 * One-time hydration:
 * Pull all important tables from cloud, normalize, then write to local storage.
 * This fixes "history disappears after refresh / different origin" issues.
 */
const ensureHydration = async () => {
  if (isHydrated) return;
  isHydrated = true;

  const tables = ['quotes', 'quote_items', 'orders', 'order_items', 'payments', 'transactions', 'settlements', 'consignment_stock'];

  for (const table of tables) {
    try {
      const cloudRows = await cloudDb.exportAll(table);
      const normalized = Array.isArray(cloudRows) ? cloudRows.map(normalizeCloudRow) : [];

      // settlements: stored per order key in localStorage
      if (table === 'settlements') {
        const byOrder: Record<string, any[]> = {};
        for (const s of normalized) {
          const orderNo = (s as any).order_no || (s as any).orderId;
          if (!orderNo) continue;
          if (!byOrder[orderNo]) byOrder[orderNo] = [];
          byOrder[orderNo].push(s);
        }
        for (const orderNo of Object.keys(byOrder)) {
          localStorage.setItem(`${APP_ID}_settlements_${orderNo}`, JSON.stringify(sortByCreatedDesc(byOrder[orderNo])));
        }

        // Optional global cache
        const localSett = getLocal('settlements');
        const mergedSett = sortByCreatedDesc(mergeById(normalized as any, localSett as any));
        setLocal('settlements', mergedSett);
        continue;
      }

      const local = getLocal(table);
      const merged = sortByCreatedDesc(mergeById(normalized as any, local as any));
      setLocal(table, merged);
    } catch (e) {
      console.warn(`[persistence] Hydration skipped for ${table}:`, e);
      // keep local only
    }
  }
};

export const persistence = {
  // --- Quotes ---
  async getQuotes(): Promise<QuoteRecord[]> {
    await ensureHydration();
    return getLocal('quotes');
  },

  async saveQuote(quote: QuoteRecord): Promise<void> {
    const enriched = enrichRecord(quote);
    // Finance V1 fix (2026-09): a new quote/PI is a real INSERT, never a
    // guessed-id upsert — see cloudDb.insertOne(). Capture the real row id
    // so a later archive/convert on THIS quote can target it directly.
    let withRowId: any = enriched;
    try {
      const inserted = await cloudDb.insertOne('quotes', enriched);
      if (inserted?.id) withRowId = { ...enriched, _rowId: inserted.id };
    } catch (e) {
      console.warn("[persistence] Cloud insert failed for quote:", e);
    }

    const local = getLocal('quotes');
    setLocal('quotes', sortByCreatedDesc([withRowId, ...local.filter((q: any) => q.id !== enriched.id)]));
  },

  /**
   * Update exactly ONE quote/PI (Finance V1 fix, 2026-09). Replaces the old
   * pattern of mapping the whole in-memory `quotes` array and calling
   * updateQuotes() on all of it (used by quote→order conversion and
   * archive) — that re-stamped and re-upserted every quote on every single
   * conversion/archive, the same duplication mechanism found on orders.
   * PATCHes this quote's own row by _rowId — never touches any other quote.
   * Business status/fields, PDF, numbering are all untouched by this change
   * — same payload shape as before, just a targeted write instead of a
   * broadcast one.
   */
  async updateQuote(quote: QuoteRecord): Promise<void> {
    const enriched = enrichRecord(quote);
    const rowId = await safeWriteRow('quotes', enriched, (quote as any)._rowId);
    const local = getLocal('quotes');
    setLocal('quotes', local.map((q: any) => (q.id === enriched.id ? { ...enriched, _rowId: rowId } : q)));
  },

  async updateQuotes(quotes: QuoteRecord[]): Promise<void> {
    const enriched = quotes.map(enrichRecord);
    try {
      await cloudDb.upsert('quotes', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud update failed for quotes:", e);
    }
    setLocal('quotes', sortByCreatedDesc(enriched));
  },

  async getQuoteItems(): Promise<QuoteItemRecord[]> {
    await ensureHydration();
    return getLocal('quote_items');
  },

  async saveQuoteItems(items: QuoteItemRecord[]): Promise<void> {
    const enriched = items.map(enrichRecord);
    try {
      await cloudDb.upsert('quote_items', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for quote items:", e);
    }

    const local = getLocal('quote_items');
    setLocal('quote_items', sortByCreatedDesc([...enriched, ...local]));
  },

  // --- Orders ---
  async getOrders(): Promise<OrderRecord[]> {
    await ensureHydration();
    return getLocal('orders');
  },

  async saveOrder(order: OrderRecord): Promise<void> {
    const enriched = enrichRecord(order);
    // Finance V1 fix (2026-09): a brand-new order is a real INSERT, never a
    // guessed-id upsert — see cloudDb.insertOne(). Capture the real row id
    // it comes back with so any later edit/void/adjustment/payment on THIS
    // order can target it directly via updateOrder() instead of falling
    // back to the old broken merge path.
    let withRowId: any = enriched;
    try {
      const inserted = await cloudDb.insertOne('orders', enriched);
      if (inserted?.id) withRowId = { ...enriched, _rowId: inserted.id };
    } catch (e) {
      console.warn("[persistence] Cloud insert failed for order:", e);
    }

    const local = getLocal('orders');
    setLocal('orders', sortByCreatedDesc([withRowId, ...local.filter((o: any) => o.id !== enriched.id)]));
  },

  /**
   * Update exactly ONE order (Finance V1 fix, 2026-09). Replaces the old
   * pattern of mapping the whole in-memory `orders` array and calling
   * updateOrders() on all of it — that re-stamped every order's updated_at
   * and re-upserted every order on every single edit/void/adjustment/
   * payment, which is the mechanism that produced the duplicate PENDING/
   * PAID/VOIDED rows found in the audit. This touches only `order`'s own
   * row (by _rowId when known) and leaves every other order untouched.
   */
  async updateOrder(order: OrderRecord): Promise<void> {
    const enriched = enrichRecord(order);
    const rowId = await safeWriteRow('orders', enriched, (order as any)._rowId);
    const local = getLocal('orders');
    setLocal('orders', local.map((o: any) => (o.id === enriched.id ? { ...enriched, _rowId: rowId } : o)));
  },

  async updateOrders(orders: OrderRecord[]): Promise<void> {
    const enriched = orders.map(enrichRecord);
    try {
      await cloudDb.upsert('orders', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud update failed for orders:", e);
    }
    setLocal('orders', sortByCreatedDesc(enriched));
  },

  async getOrderItems(): Promise<OrderItemRecord[]> {
    await ensureHydration();
    return getLocal('order_items');
  },

  async saveOrderItems(items: OrderItemRecord[]): Promise<void> {
    const enriched = items.map(enrichRecord);
    try {
      await cloudDb.upsert('order_items', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for order items:", e);
    }

    const local = getLocal('order_items');
    setLocal('order_items', sortByCreatedDesc([...enriched, ...local]));
  },

  // --- Payments ---
  async getPayments(): Promise<PaymentRecord[]> {
    await ensureHydration();
    return getLocal('payments');
  },

  async savePayment(payment: PaymentRecord): Promise<void> {
    const enriched = enrichRecord(payment);
    // Finance V1 fix (2026-09): a new payment is a real INSERT, never a
    // guessed-id upsert — see cloudDb.insertOne(). Capture the real row id
    // so a later edit/delete on THIS payment can target it directly.
    let withRowId: any = enriched;
    try {
      const inserted = await cloudDb.insertOne('payments', enriched);
      if (inserted?.id) withRowId = { ...enriched, _rowId: inserted.id };
    } catch (e) {
      console.warn("[persistence] Cloud insert failed for payment:", e);
    }

    const local = getLocal('payments');
    setLocal('payments', sortByCreatedDesc([withRowId, ...local]));
  },

  /**
   * Update exactly ONE payment (Finance V1 fix, 2026-09). PATCHes this
   * payment's own row by _rowId — never touches any other payment.
   */
  async updatePayment(payment: PaymentRecord): Promise<void> {
    const enriched = enrichRecord(payment);
    const rowId = await safeWriteRow('payments', enriched, (payment as any)._rowId);
    const local = getLocal('payments');
    setLocal('payments', local.map((p: any) => (p.id === enriched.id ? { ...enriched, _rowId: rowId } : p)));
  },

  /**
   * Delete exactly ONE payment (Finance V1 fix, 2026-09). Deletes this
   * payment's own row by _rowId — never touches any other payment.
   */
  async deletePayment(payment: PaymentRecord): Promise<void> {
    const rowId = (payment as any)._rowId as string | undefined;
    try {
      if (rowId) {
        await cloudDb.remove('payments', [rowId]);
      } else {
        console.warn('[persistence] deletePayment: no _rowId known for', payment.id, '— cloud row left untouched, deleted locally only.');
      }
    } catch (e) {
      console.warn("[persistence] Cloud delete failed for payment:", e);
    }
    const local = getLocal('payments');
    setLocal('payments', local.filter((p: any) => p.id !== payment.id));
  },

  // --- Finance Transactions (Ledger) ---
  async getTransactions(): Promise<TransactionRecord[]> {
    await ensureHydration();
    return getLocal('transactions');
  },

  async saveTransactions(transactions: TransactionRecord[]): Promise<void> {
    const enriched = transactions.map(enrichRecord);
    try {
      await cloudDb.upsert('transactions', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for transactions:", e);
    }
    setLocal('transactions', sortByCreatedDesc(enriched));
  },

  /**
   * Cache a transactions list locally WITHOUT touching cloud (Finance V1
   * fix, 2026-09). Found while checking for remaining re-upload risk:
   * FinanceTracker was calling saveTransactions() just to cache a list it
   * had already fetched from (or was intentionally keeping local-only
   * after) an edit — but saveTransactions() silently re-upserts every
   * record it's given to cloud, which is exactly the "read/modify the
   * whole list, write the whole list back" pattern this fix removes
   * everywhere else. Use this whenever the intent is purely "remember this
   * locally," not "persist these changes to cloud."
   */
  async cacheTransactionsLocally(transactions: TransactionRecord[]): Promise<void> {
    setLocal('transactions', sortByCreatedDesc(transactions));
  },

  /**
   * Add exactly ONE new ledger row (Finance V1 fix, 2026-09). The old
   * pattern — `saveTransactions([newTxn, ...existingTxns])` — re-upserted
   * the ENTIRE transaction history on every single payment, which combined
   * with the same guessed-id merge bug is what produced the ~7700 duplicate
   * "Initial Capital"/"Office Supplies" seed rows and the 1029-row PAYMENT
   * pileup (see chat audit). A brand-new transaction is always a genuine
   * INSERT — it never needs to touch any other row.
   */
  async addTransaction(transaction: TransactionRecord): Promise<void> {
    const enriched = enrichRecord(transaction);
    // Capture the real row id the insert comes back with (Finance V1,
    // 2026-09) so a later edit on THIS transaction — e.g. marking a cheque
    // Cleared — can target it directly via updateTransaction() instead of
    // falling back to the resolve-by-business-id path.
    let withRowId: any = enriched;
    try {
      const inserted = await cloudDb.insertOne('transactions', enriched);
      if (inserted?.id) withRowId = { ...enriched, _rowId: inserted.id };
    } catch (e) {
      console.warn("[persistence] Cloud insert failed for transaction:", e);
    }
    const local = getLocal('transactions');
    setLocal('transactions', sortByCreatedDesc([withRowId, ...local]));
  },

  /**
   * Update exactly ONE transaction (Finance V1, 2026-09) — e.g. moving a
   * cheque from PENDING to CLEARED/BOUNCED/CANCELLED. Same safeWriteRow
   * pattern as updateOrder/updatePayment/updateQuote: PATCH by _rowId when
   * known; otherwise resolve by business id first and refuse to guess if
   * that's ambiguous (see safeWriteRow's own doc comment above).
   */
  async updateTransaction(transaction: TransactionRecord): Promise<void> {
    const enriched = enrichRecord(transaction);
    const rowId = await safeWriteRow('transactions', enriched, (transaction as any)._rowId);
    const local = getLocal('transactions');
    setLocal('transactions', local.map((t: any) => (t.id === enriched.id ? { ...enriched, _rowId: rowId } : t)));
  },

  async updatePayments(payments: PaymentRecord[]): Promise<void> {
    const enriched = payments.map(enrichRecord);
    try {
      await cloudDb.upsert('payments', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud update failed for payments:", e);
    }
    setLocal('payments', sortByCreatedDesc(enriched));
  },

  async updateQuoteItems(items: QuoteItemRecord[]): Promise<void> {
    const enriched = items.map(enrichRecord);
    try {
      await cloudDb.upsert('quote_items', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud update failed for quote_items:", e);
    }
    setLocal('quote_items', sortByCreatedDesc(enriched));
  },

  // --- Consignment Stock ---
  async getConsignmentStock(soNo?: string): Promise<ConsignmentStockRecord[]> {
    // Hydrate first: pulls Supabase → localStorage on first load (cloud wins on conflict)
    await ensureHydration();
    const all: ConsignmentStockRecord[] = getLocal('consignment_stock');
    // Only return active records — cancelled/archived state must not appear in UI or AI queries
    const active = all.filter((r: any) => !r.state || r.state === 'active');
    return soNo ? active.filter((r) => r.soNo === soNo) : active;
  },

  async saveConsignmentStockItems(soNo: string, items: ConsignmentStockRecord[]): Promise<void> {
    const enriched = items.map(enrichRecord);
    // 1. Supabase (primary — cross-device sync)
    try {
      await cloudDb.upsert('consignment_stock', enriched);
    } catch (e) {
      console.warn('[persistence] Cloud save failed for consignment_stock:', e);
    }
    // 2. localStorage (fallback — offline / cache)
    const all: ConsignmentStockRecord[] = getLocal('consignment_stock');
    const others = all.filter((r) => r.soNo !== soNo);
    setLocal('consignment_stock', sortByCreatedDesc([...others, ...enriched] as any));
  },

  async updateConsignmentStock(item: ConsignmentStockRecord): Promise<void> {
    const enriched = enrichRecord(item);
    // 1. Supabase
    try {
      await cloudDb.upsert('consignment_stock', [enriched]);
    } catch (e) {
      console.warn('[persistence] Cloud update failed for consignment_stock:', e);
    }
    // 2. localStorage
    const all: ConsignmentStockRecord[] = getLocal('consignment_stock');
    setLocal('consignment_stock', all.map((r) => r.id === enriched.id ? enriched : r));
  },

  // --- Consignment Settlements ---
  // Always fetch live from Supabase so deleted records don't survive in localStorage.
  async getSettlements(orderId: string): Promise<any[]> {
    try {
      const cloudRows = await cloudDb.exportAll('settlements');
      const normalized = Array.isArray(cloudRows) ? cloudRows.map(normalizeCloudRow) : [];
      const filtered = normalized.filter(
        (s: any) => (s.order_no || s.orderId) === orderId
      );
      const sorted = sortByCreatedDesc(filtered);
      // Keep localStorage in sync with cloud truth
      localStorage.setItem(`${APP_ID}_settlements_${orderId}`, JSON.stringify(sorted));
      return sorted;
    } catch (e) {
      console.warn('[persistence] Cloud fetch failed for settlements, falling back to localStorage:', e);
      return JSON.parse(localStorage.getItem(`${APP_ID}_settlements_${orderId}`) || '[]');
    }
  },

  async saveSettlements(orderId: string, settlements: any[]): Promise<void> {
    const enriched = settlements.map((s) => enrichRecord({ ...s, order_no: orderId }));
    try {
      await cloudDb.upsert('settlements', enriched);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for settlements:", e);
    }
    localStorage.setItem(`${APP_ID}_settlements_${orderId}`, JSON.stringify(sortByCreatedDesc(enriched)));
  },

  async fetchAllForExport(): Promise<any> {
    const tables = ['quotes', 'quote_items', 'orders', 'order_items', 'payments', 'transactions', 'settlements', 'consignment_stock'];
    const results: any = {};
    for (const table of tables) {
      try {
        const cloudRows = await cloudDb.exportAll(table);
        const normalized = Array.isArray(cloudRows) ? cloudRows.map(normalizeCloudRow) : [];
        results[table] = sortByCreatedDesc(normalized);
      } catch (e) {
        console.warn(`[persistence] Cloud export failed for table ${table}:`, e);
        results[table] = [];
      }
    }
    return results;
  }
};
