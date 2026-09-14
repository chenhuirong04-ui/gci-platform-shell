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
  customerId: string;
  customerName: string;
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
  customerId: string;
  customerName: string;
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
  ref_type?: 'MANUAL' | 'ORDER_PAYMENT' | 'SERVICE_PAYMENT' | 'ADJUSTMENT' | 'CONSIGNMENT_SETTLEMENT';
  ref_id?: string;
  customer?: string;
  supplier?: string;
  userId?: string;
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