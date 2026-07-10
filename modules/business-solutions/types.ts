export type BSLang = 'zh' | 'en';

export type ServiceCustomerType =
  | 'GLOBAL_EXPANSION' | 'COMPANY_REGISTRATION_COMPLIANCE'
  | 'MARKET_ENTRY' | 'LOCAL_EXECUTION' | 'PROJECT_ADVISORY'
  | 'AI_DIGITALIZATION' | 'MONTHLY_SERVICE' | 'OTHER';

export type ServiceCustomerStatus =
  | 'NEW_REQUIREMENT' | 'REQUIREMENT_CONFIRMING' | 'SOLUTION_PREPARING'
  | 'SOLUTION_SENT' | 'QUOTED' | 'CONTRACT_PENDING' | 'IN_PROGRESS'
  | 'MONTHLY_SERVICE' | 'ON_HOLD' | 'COMPLETED' | 'LOST';

export type QuoteStatus =
  | 'DRAFT' | 'FINAL' | 'SENT' | 'REVISION_REQUESTED'
  | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'
  | 'Draft' | 'Final';

export type BillingType =
  | 'fixed' | 'monthly' | 'quarterly' | 'yearly'
  | 'per_cbm' | 'per_kg' | 'per_unit' | 'per_shipment'
  | 'percentage' | 'commission' | 'custom';

export interface ServiceCustomer {
  id?: string;
  customer_number?: string;
  customer_name: string;
  company_name?: string;
  contact_name?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  country?: string;
  city?: string;
  address?: string;
  preferred_language?: string;
  customer_source?: string;
  primary_service_type?: ServiceCustomerType;
  service_tags?: string[];
  requirement_summary?: string;
  requirement_details?: string;
  budget_range?: string;
  expected_start_date?: string;
  requires_monthly_service?: boolean;
  status?: ServiceCustomerStatus;
  priority?: 'A' | 'B' | 'C';
  owner?: string;
  next_action?: string;
  follow_up_date?: string;
  last_follow_up_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceCategory {
  id?: string;
  name_cn: string;
  name_en: string;
  sort_order: number;
}

export interface ServiceCatalogItem {
  id?: string;
  category_id: string;
  name_cn: string;
  name_en: string;
  default_unit: string;
  default_billing_type: BillingType;
  sort_order: number;
  active: boolean;
  description_zh?: string;
  description_en?: string;
  scope_zh?: string;
  scope_en?: string;
  deliverables_zh?: string;
  deliverables_en?: string;
  exclusions_zh?: string;
  exclusions_en?: string;
  one_time_fee?: number;
  monthly_fee?: number;
  annual_fee?: number;
  default_quantity?: number;
  default_months?: number;
  default_timeline?: string;
  default_payment_terms_zh?: string;
  default_payment_terms_en?: string;
  minimum_price?: number;
  allow_price_edit?: boolean;
  updated_at?: string;
}

export interface ServiceQuoteLineItem {
  id: string;
  catalog_service_id?: string;
  category_name: string;
  service_name: string;
  description: string;
  scope: string;
  deliverables: string;
  item_exclusions: string;
  timeline: string;
  unit: string;
  quantity: number;
  months: number;
  billing_type: BillingType;
  billing_label: string;
  one_time_fee: number;
  monthly_fee: number;
  annual_fee: number;
  unit_price: number;
  line_total: number;
  is_optional: boolean;
  sort_order: number;
}

export interface ServiceQuote {
  id?: string;
  quote_no: string;
  version: number;
  quotation_title?: string;
  customer_id?: string;
  customer_name: string;
  contact_person?: string;
  service_type?: string;
  quote_date: string;
  valid_until?: string;
  currency: string;
  project_duration?: string;
  payment_terms?: string;
  notes?: string;
  exclusions?: string;
  delivery_period?: string;
  owner?: string;
  status: QuoteStatus;
  discount_type?: 'fixed' | 'percent';
  discount_value?: number;
  discount_amount?: number;
  subtotal_one_time?: number;
  subtotal_monthly?: number;
  subtotal_annual?: number;
  total_one_time?: number;
  monthly_fee?: number;
  annual_recurring_amount?: number;
  grand_total?: number;
  total_amount: number;
  sent_at?: string;
  accepted_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type BSTab = 'customers' | 'new-quote' | 'quotes' | 'catalog';
