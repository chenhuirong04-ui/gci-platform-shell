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
    | 'knowledgeRules'
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
    | 'supplierLibrary'
    | 'accessVault';
  count?: string;
  badgeColor?: string;
  badgeBg?: string;
  /** Internal SPA route. Items without a path fall back to a "coming soon" toast. */
  path?: string;
  /** Optional: only show this entry to users holding one of these modules (or Admin, if adminSees).
   * Entries without it are always shown, as before. Data access is still decided by RLS. */
  modules?: string[];
  adminSees?: boolean;
}

export interface SectionDef {
  /** Key into dict.nav for the section header label. */
  labelKey: 'salesSection' | 'supplyChainSection' | 'businessServicesSection' | 'financeSection' | 'internalSection' | 'platformSection';
  items: ModuleDef[];
}

/**
 * GCI Platform IA — Nav consolidation V3 (2026-09-15): regrouped by
 * business domain (SALES / SUPPLY / BUSINESS SERVICES / FINANCE / INTERNAL
 * / SYSTEM) instead of by legacy app names. This round's change is
 * INFORMATION ARCHITECTURE ONLY — no business component was touched,
 * copied, or had its route removed. Every path below already existed
 * before this round; only which section a row sits under, and the section
 * header text, changed.
 *
 * The previous grouping (V1/V2, comments preserved below on each item)
 * had a "supplyChainSection" header literally labelled "TRADE · 贸易运营"
 * that lumped Trade (TR), Supplier Library (VL), Quotation Center (QC) and
 * Business Solutions (BS) together under one legacy-app-shaped title, even
 * though QC is a Sales tool and BS is its own business line — exactly the
 * "multiple old apps taped together" symptom this round removes. Fixed by:
 *   - QC (报价中心) moved into SALES, next to CRM's own Sales rows.
 *   - BS (企业解决方案) promoted to its own BUSINESS SERVICES section.
 *   - supplyChainSection now holds only VL (供应商库) — matches its new
 *     "SUPPLY" header; a future Purchase Order module goes here later,
 *     per explicit instruction not to add that entry yet.
 *   - TR (贸易运营 — Trade's own quoting/orders/inventory/consignment/
 *     sales-history tabs) is placed in SALES: it IS the sales execution
 *     tool (PI issuance, order fulfillment, sales dashboard), even though
 *     it also touches inventory/consignment internally — those stay
 *     reachable via Trade's own tab strip exactly as before, this only
 *     decides which top-level section its ONE sidebar row lives under.
 *     Flag this placement for review if a different bucket was intended;
 *     it wasn't named explicitly in the requested section item lists.
 *   - operationsSection renamed internalSection ("INTERNAL") — unchanged
 *     contents (内部事项/公司文件), just the header text and key name.
 *   - platformSection kept its key name, header text now "SYSTEM"
 *     (设置 first, 历史 AI 工具/Legacy second — reordered to match).
 *   - IV (发票管理) DROPPED from the sidebar — Invoice is now a FinanceCenter
 *     internal tab (see modules/trade/components/FinanceCenter.tsx) instead
 *     of its own top-level entry. The /invoice ROUTE itself is untouched
 *     and still resolves (App.tsx keeps the <Route path="/invoice">), so
 *     any existing bookmark/deep link to /invoice keeps working — it's
 *     only no longer reachable via a dedicated sidebar row.
 *
 * WORKSPACE (每日工作台) is not a row in `sections` — it's the sidebar's
 * separate `navTop` item (see apps/shell/src/App.tsx's `sidebarProps`),
 * unchanged by this round.
 *
 * Nav final collapse (2026-09-16) — sidebar down to 11 top-level rows.
 * Two items removed from `sections` entirely (both consolidated into an
 * existing entry's internal tabs, not deleted):
 *   - AV (账号与权限/Access Vault) — was already path-less (never had a
 *     route). Now a tab inside 公司文件/CompanyDocuments.tsx.
 *   - AI (历史 AI 工具/Legacy) — had a real route, /ai, which is UNCHANGED
 *     and still resolves directly. Now also reachable as a "历史工具" tab
 *     inside 设置/Settings.tsx (ST gained its first real path, /settings).
 * customersAndProjects (CP)'s own page also changed this round —
 * CrmCustomers.tsx now opens on an outer "客户档案" tab (its existing
 * directory/today/overdue/archived sub-tabs are unchanged beneath it) —
 * but CP's path/position here is untouched, that change lives entirely
 * inside the page component.
 */
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
      // Nav consolidation V2 (2026-09) — Engineering/BOQ Quote, Supplier
      // Quote, and Package Quote used to be three separate rows, all pointing
      // into QuotationModule via ?mode= -- same "same page reachable several
      // different ways" duplication Trade below also had. Collapsed into one
      // "报价中心 / Quotation Center" entry; QuotationModule has a small
      // always-visible tab strip (customer-quote/supplier-quote/package-quote
      // only — not landing/service-quote) so users can move between the
      // three without leaving the module. Defaults to customer-quote
      // (工程/BOQ报价, the most-used one) rather than the existing 4-card
      // `landing` picker, per explicit instruction — landing itself is
      // untouched and still reachable from inside the module. All three old
      // ?mode= deep links keep working unchanged.
      { code: 'QC', nameKey: 'quotationCenter', count: '4', badgeColor: '#A89878', badgeBg: 'rgba(255,255,255,0.07)', path: '/quotation?mode=customer-quote' },
      // Nav consolidation V1 (2026-09) — PI Quote / Quote History / Inventory
      // / Consignment / Stock Ledger used to each get their own flat sidebar
      // row, all five pointing into TradeModule via ?tab= — duplicating the
      // tab strip TradeModule already has internally. Collapsed into one
      // "Trade" entry (lands on TradeModule's own home dashboard); those
      // five pages are still fully reachable via Trade's own top tab strip
      // (see TradeModule.tsx) — unchanged by this round, only moved from
      // the old mixed "TRADE · 贸易运营" section into SALES (see file header
      // comment for why).
      { code: 'TR', nameKey: 'tradeOps', path: '/trade' },
    ],
  },
  {
    // SUPPLY — Nav consolidation V3 (2026-09-15): now holds only Supplier
    // Library. A future Purchase Order / procurement module goes here
    // later, per explicit instruction not to add that entry in this round.
    labelKey: 'supplyChainSection',
    items: [
      { code: 'VL', nameKey: 'supplierLibrary', path: '/suppliers' },
    ],
  },
  {
    // BUSINESS SERVICES — split out of the old mixed "TRADE · 贸易运营"
    // section (2026-09-15); Business Solutions was never actually a Trade
    // sub-function, it's its own business line with no TradeModule
    // equivalent, hence its own top-level section now.
    labelKey: 'businessServicesSection',
    items: [
      { code: 'BS', nameKey: 'businessSolutions', path: '/business-solutions' },
      // Knowledge & Rules (migrated Knowledge Hub) — part of Enterprise Services, not its own section.
      { code: 'KR', nameKey: 'knowledgeRules', path: '/business-solutions/knowledge',
        modules: ['knowledge_public', 'knowledge', 'knowledge_confidential'], adminSees: true },
    ],
  },
  {
    // Nav consolidation V2 (2026-09): 资金流水 (CH) and 财务账 (FL) used to
    // be two separate sidebar rows pointing at two separate TradeModule
    // tabs. Collapsed into one "财务中心 / Finance" entry landing on a
    // FinanceCenter hub (see modules/trade/components/FinanceCenter.tsx)
    // with its own internal tab strip (总览/银行账户/资金流水/应付账款/
    // 发票管理) — same consolidation pattern already used for the "Trade"
    // entry above. /trade?tab=cashflow and /trade?tab=finance keep working
    // as deep links (TradeModule still resolves both, landing on the
    // matching FinanceCenter sub-tab) — nothing that already links to
    // either old path needed to change.
    //
    // Nav consolidation V3 (2026-09-15): Invoice Manager's own sidebar row
    // (IV) is gone — 发票管理 is now a FinanceCenter internal tab instead of
    // a separate top-level entry (see FinanceCenter.tsx). The /invoice
    // route itself is untouched and still resolves for any existing
    // bookmark/deep link.
    labelKey: 'financeSection',
    items: [
      { code: 'FC', nameKey: 'financeCenter', path: '/trade?tab=finance-center' },
    ],
  },
  {
    // Renamed from operationsSection (2026-09-15) — contents unchanged
    // (内部事项/公司文件), Inventory/Consignment/Stock Ledger were already
    // moved out of here in an earlier round (see TR above, reachable via
    // Trade's own tab strip). INTERNAL now holds only internally-executed
    // company work, not supply-chain flow.
    labelKey: 'internalSection',
    items: [
      { code: 'IT', nameKey: 'internalTasks', path: '/crm?tab=internal' },
      // Nav final collapse (2026-09-16) — 账号与权限/Access Vault moved OFF
      // the sidebar entirely, into an internal tab of 公司文件/Company
      // Documents (see CompanyDocuments.tsx) — it never had its own route
      // to begin with (was a path-less "coming soon" placeholder), so
      // there's no old link to preserve. Sidebar CD row now lands on the
      // same /company-documents page, which itself defaults to the
      // documents tab.
      { code: 'CD', nameKey: 'companyDocuments', path: '/company-documents' },
    ],
  },
  {
    labelKey: 'platformSection',
    items: [
      // Nav final collapse (2026-09-16) — 设置 gains its first real route:
      // a small tab container (see pages/Settings.tsx) whose second tab is
      // 历史工具 (renamed from 历史 AI 工具/Legacy), embedding the existing
      // <AIPage/> unchanged. The old /ai route is untouched and still
      // resolves directly for any existing bookmark/deep link — it's only
      // no longer reachable via its own dedicated sidebar row.
      { code: 'ST', nameKey: 'settings', path: '/settings' },
    ],
  },
];
