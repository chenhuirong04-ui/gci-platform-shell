export interface ModuleDef {
  code: string;
  /** Key into dict.nav for the display label. */
  nameKey:
    | 'controlCenter'
    | 'customerFollowUp'
    | 'businessCenter'
    | 'historyArchive'
    | 'piQuote'
    | 'engineeringQuote'
    | 'supplierQuote'
    | 'packageQuote'
    | 'serviceQuote'
    | 'quoteHistory'
    | 'inventory'
    | 'consignment'
    | 'stockLedger'
    | 'internalTasks'
    | 'cashFlow'
    | 'financeLedger'
    | 'aiAssistant'
    | 'settings';
  count?: string;
  badgeColor?: string;
  badgeBg?: string;
  /** Internal SPA route. Items without a path fall back to a "coming soon" toast. */
  path?: string;
}

export interface SectionDef {
  /** Key into dict.nav for the section header label. */
  labelKey: 'salesSection' | 'supplyChainSection' | 'operationsSection' | 'financeSection' | 'platformSection';
  items: ModuleDef[];
}

/** GCI Platform V2 information architecture — reorganized by business
 * function (SALES / SUPPLY CHAIN / OPERATIONS / FINANCE / PLATFORM) instead
 * of by legacy app (CRM / Trade / Quotation). Underlying data/APIs are
 * unchanged — items route into the same three modules via `?tab=`/`?mode=`
 * params the modules already read for deep-linking; this is a navigation
 * and grouping change only.
 *
 * Known product gap (not a nav bug — see SL comment below): "Stock Ledger"
 * has no real list view anywhere in Trade yet, so it points at the closest
 * existing screen (Inventory) rather than a dedicated ledger page. */
export const sections: SectionDef[] = [
  {
    labelKey: 'salesSection',
    items: [
      { code: 'CC', nameKey: 'controlCenter', path: '/crm?tab=control' },
      { code: 'CF', nameKey: 'customerFollowUp', count: '5', badgeColor: '#E2C988', badgeBg: 'rgba(203,168,92,0.16)', path: '/crm?tab=dashboard' },
      { code: 'BC', nameKey: 'businessCenter', path: '/crm?tab=project' },
      { code: 'HA', nameKey: 'historyArchive', path: '/crm?tab=history' },
    ],
  },
  {
    labelKey: 'supplyChainSection',
    items: [
      { code: 'PQ', nameKey: 'piQuote', path: '/trade?tab=quote' },
      { code: 'EQ', nameKey: 'engineeringQuote', count: '4', badgeColor: '#A89878', badgeBg: 'rgba(255,255,255,0.07)', path: '/quotation?mode=customer-quote' },
      { code: 'SQ', nameKey: 'supplierQuote', path: '/quotation?mode=supplier-quote' },
      { code: 'PK', nameKey: 'packageQuote', path: '/quotation?mode=package-quote' },
      { code: 'SV', nameKey: 'serviceQuote', path: '/quotation?mode=service-quote' },
      { code: 'QH', nameKey: 'quoteHistory', path: '/trade?tab=history' },
    ],
  },
  {
    labelKey: 'operationsSection',
    items: [
      { code: 'IV', nameKey: 'inventory', count: '2', badgeColor: '#D0906A', badgeBg: 'rgba(224,132,106,0.14)', path: '/trade?tab=inventory' },
      { code: 'CS', nameKey: 'consignment', path: '/trade?tab=consignment' },
      // Was '/trade?tab=history' (Step 1 guess) -- confirmed wrong on review:
      // HistoryDashboard's tabs are 报价历史/订单中心/应收核销, no stock-ledger
      // view exists there. InventoryManager (库存 tab) is the closest real
      // destination -- it's the only place that writes to STOCK_LEDGER (an
      // adjustment form), even though there's no ledger list view yet. A
      // real "view stock ledger history" page doesn't exist in the product
      // yet; flagged separately as a feature gap, not a nav fix.
      { code: 'SL', nameKey: 'stockLedger', path: '/trade?tab=inventory' },
      { code: 'IT', nameKey: 'internalTasks', path: '/crm?tab=internal' },
    ],
  },
  {
    labelKey: 'financeSection',
    items: [
      { code: 'CH', nameKey: 'cashFlow', path: '/trade?tab=cashflow' },
      { code: 'FL', nameKey: 'financeLedger', path: '/trade?tab=finance' },
    ],
  },
  {
    labelKey: 'platformSection',
    items: [
      { code: 'AI', nameKey: 'aiAssistant' },
      { code: 'ST', nameKey: 'settings' },
    ],
  },
];
