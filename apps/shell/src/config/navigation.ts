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
 * Known overlap (intentional, to be revisited when page-internal content
 * is reorganized): "Quote History" and "Stock Ledger" both currently point
 * at Trade's combined HistoryDashboard (?tab=history), since that view
 * isn't yet split into separate quote-history vs stock-ledger pages. */
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
      { code: 'SL', nameKey: 'stockLedger', path: '/trade?tab=history' },
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
