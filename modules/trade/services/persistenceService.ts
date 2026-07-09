import {
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
    try {
      await cloudDb.upsert('quotes', [enriched]);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for quote:", e);
    }

    const local = getLocal('quotes');
    setLocal('quotes', sortByCreatedDesc([enriched, ...local.filter((q: any) => q.id !== enriched.id)]));
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
    try {
      await cloudDb.upsert('orders', [enriched]);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for order:", e);
    }

    const local = getLocal('orders');
    setLocal('orders', sortByCreatedDesc([enriched, ...local.filter((o: any) => o.id !== enriched.id)]));
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
    try {
      await cloudDb.upsert('payments', [enriched]);
    } catch (e) {
      console.warn("[persistence] Cloud save failed for payment:", e);
    }

    const local = getLocal('payments');
    setLocal('payments', sortByCreatedDesc([enriched, ...local]));
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
