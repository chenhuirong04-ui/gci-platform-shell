// Shared types for Business Solutions financial layer.
// Keep separate from trade OrderRecord / PaymentRecord.

export type ServiceFeeType = 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';

export type ServiceFeeNature =
  | 'SERVICE_REVENUE'
  | 'PASS_THROUGH_COST'
  | 'THIRD_PARTY_COST';

export type ServicePaymentStatus =
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export interface ServiceReceivable {
  // business ID stored inside payload
  id: string;                       // SR-{timestamp}

  // source tracing
  source_module: 'BUSINESS_SOLUTIONS';
  source_type: 'SERVICE_QUOTE';
  source_id: string;                // = quote_id

  // customer
  customer_id: string;
  customer_name: string;

  // quote reference
  quote_id: string;
  quote_no: string;
  quote_item_id?: string;
  service_summary: string;
  service_name?: string;
  service_category?: string;

  // fee breakdown
  currency: string;
  fee_type: ServiceFeeType;
  fee_nature: ServiceFeeNature;
  amount: number;                   // base amount (excl. VAT)
  vat_amount: number;
  total_receivable: number;         // amount + vat_amount

  // collection state
  received_amount: number;
  outstanding_amount: number;
  payment_status: ServicePaymentStatus;

  // schedule
  due_date: string;                 // YYYY-MM-DD
  billing_period_start?: string;
  billing_period_end?: string;

  // accounting
  income_category: string;

  // meta
  owner: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ServicePayment {
  id: string;                       // SP-{timestamp}

  // links
  receivable_id: string;
  source_module: 'BUSINESS_SOLUTIONS';
  source_type: 'SERVICE_PAYMENT';

  // customer + quote context (denormalised for ledger)
  customer_id: string;
  customer_name: string;
  quote_id: string;
  quote_no: string;
  income_category: string;

  // payment details
  payment_date: string;             // YYYY-MM-DD
  amount: number;
  currency: string;
  account: 'Corporate' | 'Personal' | 'Cash';
  payment_method: 'CASH' | 'BANK' | 'CHEQUE' | 'OTHER';
  bank_reference: string;
  receipt_url: string;
  notes: string;

  // audit
  created_by: string;
  created_at: string;
  updated_at: string;
}
