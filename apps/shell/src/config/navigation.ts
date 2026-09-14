export interface ModuleDef {
  code: string;
  /** Key into dict.nav for the display label. */
  nameKey:
    | 'controlCenter'
    | 'customerFollowUp'
    | 'businessCenter'
    | 'historyArchive'
    | 'businessOverview'
    | 'customersAndProjects'
    | 'tradeOps'
    | 'piQuote'
    | 'engineeringQuote'
    | 'supplierQuote'
    | 'packageQuote'
    | 'quotationCenter'
    | 'serviceQuote'
    | 'businessSolutions'
    | 'quoteHistory'
    | 'inventory'
    | 'consignment'
    | 'stockLedger'
    | 'internalTasks'
    | 'companyDocuments'
    | 'cashFlow'
    | 'financeLedger'
    | 'financeCenter'
    | 'invoiceManager'
    | 'aiAssistant'
    | 'settings'
    | 'supplierLibrary';
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
 * Nav consolidation V1 (2026-09): Trade's own PI Quote / Quote History /
 * Inventory / Consignment / Stock Ledger rows were collapsed into a single
 * "Trade" entry (see the supplyChainSection comment below) — TradeModule's
 * own top tab strip is now the one place those live, instead of duplicating
 * them as flat sidebar rows too. "Stock Ledger" still has no real list view
 * of its own anywhere in Trade (pre-existing product gap, not a nav bug) —
 * its tab still just points at the closest existing screen (Inventory). */
export const sections: SectionDef[] = [
  {
    labelKey: 'salesSection',
    items: [
      // V1 nav consolidation: Control Center / Customer Follow-up / Business
      // Center / History Archive were four separate entries all reading the
      // same underlying Follow-up Log data — collapsed into two. Old ?tab=
      // values still resolve inside CrmModule.tsx for bookmark compatibility.
      { code: 'BO', nameKey: 'businessOverview', path: '/crm?tab=control' },
      // Task 17.2 — repointed from legacy /crm?tab=project (localStorage/
      // Notion) to the new Supabase-backed CRM page. Legacy Projects/
      // internal tasks remain reachable via 业务总览 (BO, still /crm) —
      // this entry is customer-only now, matching what it's actually for.
      { code: 'CP', nameKey: 'customersAndProjects', path: '/crm-customers' },
    ],
  },
  {
    // Nav consolidation V1 (2026-09) — PI Quote / Quote History / Inventory /
    // Consignment / Stock Ledger used to each get their own flat sidebar row,
    // all five pointing into TradeModule via ?tab= -- duplicating the tab
    // strip TradeModule already has internally. Collapsed into one "Trade"
    // entry (lands on TradeModule's own home dashboard, not a specific tab);
    // those five pages are still fully reachable, now via Trade's own top
    // tab strip (see TradeModule.tsx). VL/BS are genuinely separate modules
    // with no TradeModule equivalent, so they keep their own rows.
    //
    // Nav consolidation V2 (2026-09) — Engineering/BOQ Quote, Supplier
    // Quote, and Package Quote used to be three separate rows, all pointing
    // into QuotationModule via ?mode= -- same "same page reachable several
    // different ways" duplication as Trade above, except here the three
    // ?mode= values were already just one component's own internal appMode
    // switch (QuotationModule.tsx), not three separate components. Collapsed
    // into one "报价中心 / Quotation Center" entry; QuotationModule gained a
    // small always-visible tab strip (customer-quote/supplier-quote/
    // package-quote only — not landing/service-quote) so users can move
    // between the three without leaving the module. Defaults to
    // customer-quote (工程/BOQ报价, the most-used one) rather than the
    // existing 4-card `landing` picker, per explicit instruction — landing
    // itself is untouched and still reachable from inside the module.
    // All three old ?mode= deep links keep working unchanged.
    labelKey: 'supplyChainSection',
    items: [
      { code: 'TR', nameKey: 'tradeOps', path: '/trade' },
      { code: 'VL', nameKey: 'supplierLibrary', path: '/suppliers' },
      { code: 'QC', nameKey: 'quotationCenter', count: '4', badgeColor: '#A89878', badgeBg: 'rgba(255,255,255,0.07)', path: '/quotation?mode=customer-quote' },
      { code: 'BS', nameKey: 'businessSolutions', path: '/business-solutions' },
    ],
  },
  {
    // Inventory/Consignment/Stock Ledger moved here from OPERATIONS (Chris's
    // call: they're one supply-chain flow, not internal execution). OPERATIONS
    // now holds only internally-executed work -- Internal Tasks today,
    // Delivery/Installation/Execution-type items later.
    labelKey: 'operationsSection',
    items: [
      { code: 'IT', nameKey: 'internalTasks', path: '/crm?tab=internal' },
      { code: 'CD', nameKey: 'companyDocuments', path: '/company-documents' },
    ],
  },
  {
    // Nav consolidation V2 (2026-09): 资金流水 (CH) and 财务账 (FL) used to
    // be two separate sidebar rows pointing at two separate TradeModule
    // tabs. Collapsed into one "财务中心 / Finance" entry landing on a new
    // FinanceCenter hub (see modules/trade/components/FinanceCenter.tsx)
    // with its own internal tab strip (总览/银行账户/资金流水) — same
    // consolidation pattern already used for the "Trade" entry above.
    // /trade?tab=cashflow and /trade?tab=finance keep working as deep
    // links (TradeModule still resolves both, landing on the matching
    // FinanceCenter sub-tab) — nothing that already links to either old
    // path (AI capability map, action center, etc.) needed to change.
    labelKey: 'financeSection',
    items: [
      { code: 'FC', nameKey: 'financeCenter', path: '/trade?tab=finance-center' },
      { code: 'IV', nameKey: 'invoiceManager', path: '/invoice' },
    ],
  },
  {
    labelKey: 'platformSection',
    items: [
      { code: 'AI', nameKey: 'aiAssistant', path: '/ai' },
      { code: 'ST', nameKey: 'settings' },
    ],
  },
];
