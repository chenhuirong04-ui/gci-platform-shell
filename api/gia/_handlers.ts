// GIA P0 — tool id → the existing endpoint handler it wraps (in-process call).
// Each handler runs its own requireModule check on the forwarded caller token.
import resolveProduct from '../ai/resolve-product';
import checkInventory from '../trade/check-inventory';
import inventoryTableAlerts from '../ai/inventory-table-alerts';
import productOverview from '../ai/product-overview';
import quotationHistory from '../ai/quotation-history';
import checkQuotationFollowups from '../trade/check-quotation-followups';
import customer360 from '../ai/customer-360';
import consignmentSummary from '../ai/consignment-summary';
import receivablesSummary from '../ai/receivables-summary';
import salesSummary from '../ai/sales-summary';
import invoicePendingSummary from '../invoice/pending-summary';
import supplierSearch from '../suppliers/search';
import dailyBrief from '../ai/daily-brief';
import piLookup from '../trade/pi-lookup';
import orderLookup from '../trade/order-lookup';
import paymentList from '../trade/payment-list';
import serviceReceivablesSummary from '../bs/receivables-brief-summary';
import serviceContractStatus from '../bs/contract-status-brief-summary';
import bankBalances from '../finance/bank-balances';
import payablesDue from '../finance/payables-due';
import pendingVouchers from '../finance/pending-vouchers';
import bankReconciliationStatus from '../finance/reconciliation-status';
import projectCustomerProfit from '../finance/profitability';
import companyDocuments from '../company/documents';
import internalTasks from '../company/tasks';
import knowledgeSearch from '../company/knowledge';
import crmFollowups from '../crm/followups-due';

export type GiaHandler = (request: Request) => Promise<Response>;

export const GIA_HANDLERS: Record<string, GiaHandler> = {
  resolve_product: resolveProduct,
  check_inventory: checkInventory,
  inventory_table_alerts: inventoryTableAlerts,
  product_overview: productOverview,
  quotation_history: quotationHistory,
  check_quotation_followups: checkQuotationFollowups,
  customer_360: customer360,
  consignment_summary: consignmentSummary,
  receivables_summary: receivablesSummary,
  sales_summary: salesSummary,
  invoice_pending_summary: invoicePendingSummary,
  supplier_search: supplierSearch,
  daily_brief: dailyBrief,
  pi_lookup: piLookup,
  order_lookup: orderLookup,
  payment_list: paymentList,
  service_receivables_summary: serviceReceivablesSummary,
  service_contract_status: serviceContractStatus,
  bank_balances: bankBalances,
  payables_due: payablesDue,
  pending_vouchers: pendingVouchers,
  bank_reconciliation_status: bankReconciliationStatus,
  project_customer_profit: projectCustomerProfit,
  company_documents: companyDocuments,
  internal_tasks: internalTasks,
  knowledge_search: knowledgeSearch,
  crm_followups: crmFollowups,
};
