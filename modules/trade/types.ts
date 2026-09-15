export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type PaymentTermType = 'COD' | 'NET_DAYS' | 'DUE_DATE' | 'CREDIT_TEXT';

export interface QuoteItemRecord {
  quoteId: string;
  productId?: string;
  desc: string;
  qty: number;
  price: number;
  unit_price?: number;
  lineTotal: number;
}

export interface QuoteRecord {
  id: string;
  createdAt: string;
  userId: string;
  operatorName: string;
  /** Legacy field — historically either a real-ish id or the literal
   * constant "INTERNAL_ID" written by every PI save regardless of which
   * customer was actually picked (see Customer/Project Linking V1 audit,
   * 2026-09). Kept for backward compatibility, no longer written by new
   * code (new saves leave it '') — crmCustomerId is the real relation now. */
  customerId: string;
  customerName: string;
  /** Customer/Project Linking V1 (2026-09-15) — real FK to
   * crm_customers.id / crm_projects.id. Undefined on any record created
   * before this round (never backfilled by guessing). */
  crmCustomerId?: string;
  crmProjectId?: string;
  subtotal: number;
  vat: number;
  grandTotal: number;
  status: 'DRAFT' | 'QUOTED' | 'CONVERTED' | 'LOST';
  currency: 'AED';
  paymentTerms: string; // 自由文本
  dueDate: string;
  convertedOrderId?: string;
  // Project PI fields (optional — never break existing Standard PI)
  piType?: 'STANDARD' | 'PROJECT' | 'NON_STOCK';
  projectName?: string;
  quoteRef?: string;
  pdfUrl?: string;
  sourceApp?: string;
  costAmount?: number;
  marginRate?: number;
  profitAmount?: number;
  notes?: string; // supplier terms, payment terms, lead time — from Quotation Center
  /** Real Postgres row id (Finance V1, 2026-09) — see OrderRecord._rowId. */
  _rowId?: string;
}

export interface OrderRecord {
  id: string;
  quoteId: string;
  createdAt: string;
  /** Legacy field — see QuoteRecord.customerId's doc comment; same
   * history, same "stop writing INTERNAL_ID, crmCustomerId is real now"
   * status. Orders inherit whatever their source quote had here. */
  customerId: string;
  customerName: string;
  /** Customer/Project Linking V1 (2026-09-15) — inherited verbatim from
   * the quote this order was converted from (convertQuoteToOrder). Real FK
   * to crm_customers.id / crm_projects.id; undefined on pre-existing
   * orders and never backfilled by guessing. */
  crmCustomerId?: string;
  crmProjectId?: string;
  subtotal: number;
  vat: number;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CONSIGNMENT' | 'VOIDED';
  userId: string;
  paymentTerms: string;
  dueDate: string;
  transactionMode?: 'Direct Sale' | 'Consignment';
  consignmentStatus?: 'Sent' | 'On Sale' | 'Sold Reported' | 'Settled' | 'Exception';
  consignmentSoldQty?: number;
  order_type?: 'NORMAL' | 'ADJUSTMENT';
  adjustmentOf?: string;
  adjReason?: string;
  /** Real Postgres row id (Finance V1, 2026-09) — set by normalizeCloudRow
   * so updateOrder() can PATCH this exact physical row instead of guessing
   * an id and upserting. Not present on orders created before this fix. */
  _rowId?: string;
}

export interface ConsignmentStockRecord {
  id: string;
  soNo: string;
  customerName: string;
  productId: string | null;
  productName: string;
  consignedQty: number;
  soldQty: number;
  remainingQty: number;
  unitPrice: number;
  amount: number;
  settlementStatus: 'UNSETTLED' | 'PARTIAL' | 'SETTLED';
  receivedAmount?: number;
  createdAt: string;
}

export interface OrderItemRecord {
  orderId: string;
  desc: string;
  qty: number;
  price: number;
  unit_price?: number;
  lineTotal: number;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  date: string;
  amount: number;
  method: 'CASH' | 'BANK' | 'CHEQUE' | 'OTHER';
  note: string;
  userId: string;
  /** Real Postgres row id (Finance V1, 2026-09) — see OrderRecord._rowId. */
  _rowId?: string;
}

/** Finance V1 payment method (2026-09) — replaces the old free-text
 * `account: 'Corporate'|'Cash'` label. Every new transaction must carry one. */
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
export type ChequeStatus = 'PENDING' | 'CLEARED' | 'BOUNCED' | 'CANCELLED';

/**
 * Unified 财务账 ledger row (Finance V1, 2026-09).
 *
 * `bank_account_id` is the real join key going forward — every NEW row must
 * carry it (FK to bank_accounts.id), resolved per `payment_method`:
 *   - CASH: auto-resolved to the single active Cash-type account
 *   - BANK_TRANSFER: user-picked from active bank_accounts
 *   - CHEQUE: left unset while cheque_status='PENDING'; only set (to
 *     deposited_to_bank_account_id) once cheque_status becomes 'CLEARED' —
 *     this is what makes balanceForAccount()'s existing bank_account_id
 *     filter correctly exclude un-cleared cheques without special-casing.
 *
 * `account` is kept as a display-only legacy label for rows written before
 * this change (Trade order payments had none at all; FinanceTracker's
 * manual entries had this string). Never read for balance math or new
 * writes anymore, only shown as a fallback label for old rows.
 *
 * ref_type/ref_id trace a row back to what produced it (a manual entry, an
 * order payment, a consignment settlement, etc) without needing a join.
 */
export interface TransactionRecord {
  id: string;
  date: string;
  note: string;
  type: 'in' | 'out';
  amount: number;
  bank_account_id?: string;
  account?: 'Corporate' | 'Personal' | 'Cash' | 'Other'; // legacy label — display fallback only
  ref_type?: 'MANUAL' | 'ORDER_PAYMENT' | 'SERVICE_PAYMENT' | 'ADJUSTMENT' | 'CONSIGNMENT_SETTLEMENT' | 'SUPPLIER_PAYMENT';
  ref_id?: string;
  customer?: string;
  supplier?: string;
  userId?: string;
  /** Customer/Project Linking V1 (2026-09-15) — real FK, inherited from
   * order.crmCustomerId/order.crmProjectId at payment time (never guessed
   * from `customer`, which stays a display-only snapshot). Undefined for
   * payments against orders that predate this round. */
  customer_id?: string;
  project_id?: string;
  /** Finance Reporting V1 (2026-09-15) — see
   * modules/trade/services/transactionCategories.ts. category/subcategory
   * are stamped at write time for rows the frontend writes; rows that don't
   * carry one yet (pre-this-round history, and supplier-payment rows
   * written by the create_supplier_payment() RPC) are classified at
   * report-render time by classifyTransaction() instead — never guessed
   * from `note`/`customer`/`supplier` text. */
  category?: string;
  subcategory?: string;
  /** Which module produced this row — informational only, not used for any
   * balance/report math (ref_type already drives classification). */
  source_module?: string;
  /** Real FK to suppliers.id — set alongside `supplier` (display snapshot)
   * when a manual expense entry is linked to a real supplier. Supplier
   * Payment rows already carry their own `ref_id` -> supplier_payments.id
   * -> supplier_id chain instead of duplicating it here. */
  supplier_id?: string;
  // Finance V1 payment method fields (2026-09) — see PaymentMethod above.
  payment_method?: PaymentMethod;
  cheque_number?: string;
  cheque_date?: string;
  cheque_bank?: string;
  cheque_amount?: number;
  cheque_status?: ChequeStatus;
  /** type='in' cheques only — which account the cheque was deposited into
   * once cheque_status becomes 'CLEARED'. */
  deposited_to_bank_account_id?: string;
  /** type='out' cheques only — which account the cheque is drawn against.
   * Chosen at creation time (required for every status, unlike
   * deposited_to_bank_account_id which is only needed once CLEARED). */
  issued_from_bank_account_id?: string;
  /** Real Postgres row id (Finance V1, 2026-09) — lets updateTransaction()
   * PATCH this exact physical row (e.g. marking a cheque Cleared) instead
   * of guessing an id and upserting. See OrderRecord._rowId. */
  _rowId?: string;
}

export interface BankAccount {
  id: string;
  account_name: string;
  account_type: 'Corporate' | 'Personal' | 'Cash' | 'Other';
  bank_name?: string;
  currency: string;
  opening_balance: number;
  is_active: boolean;
  notes?: string;
  // Banking detail fields (Finance V1, 2026-09) — all optional. Cash
  // accounts have no bank, so none of these are required by the form for
  // account_type:'Cash'.
  account_holder_name?: string;
  account_number?: string;
  iban?: string;
  swift_bic?: string;
  bank_address?: string;
  branch_name?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Supplier AP V1 (2026-09) — real Postgres columns + RLS, same pattern as
 * BankAccount (not the legacy {id,payload} wrapper tables). `status` is
 * maintained by a DB trigger on supplier_payables (paid_amount vs amount)
 * — never write it directly from the frontend, it will be overwritten.
 * `outstanding_amount` is a GENERATED column, same reasoning.
 */
export interface SupplierPayable {
  id: string;
  supplier_id: string;
  supplier_name: string;
  source_type: 'MANUAL' | 'SUPPLIER_QUOTE';
  source_id?: string;
  reference_no?: string;
  invoice_no?: string;
  amount: number;
  paid_amount: number;
  outstanding_amount: number;
  due_date?: string;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * A real payment against a supplier (direction is always 'out' — see
 * PaymentMethodFields). payable_id is optional: a payment doesn't have to
 * be linked to a tracked payable.
 */
export interface SupplierPayment {
  id: string;
  supplier_id: string;
  supplier_name: string;
  payable_id?: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  bank_account_id?: string;
  issued_from_bank_account_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  cheque_bank?: string;
  cheque_amount?: number;
  cheque_status?: ChequeStatus;
  reference_no?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}