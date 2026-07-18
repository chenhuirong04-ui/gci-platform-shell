// GCI Supplier Library — TypeScript types

export type SupplierType = 'Factory' | 'Trading' | 'Integrated' | 'Service' | 'Agent' | 'Unknown';
export type SupplierStatus = 'active' | 'inactive' | 'blacklisted' | 'under_review' | 'archived';
export type SupplierRating = 'A' | 'B' | 'C' | 'D';

export interface Supplier {
  id?: string;
  short_code: string;
  legacy_short_code?: string;
  code_needs_review?: boolean;
  supplier_name_display: string;
  name_cn?: string;
  name_en?: string;
  supplier_type?: SupplierType;
  product_categories?: string[];
  country?: string;
  city?: string;
  country_city_raw?: string;
  is_preferred?: boolean;
  status?: SupplierStatus;
  current_rating?: SupplierRating;
  current_score?: number;
  internal_owner?: string;
  default_lead_time_days?: number;
  payment_terms?: string;
  strength_notes?: string;
  website?: string;
  established_year?: number;
  notes?: string;
  notion_page_id?: string;
  notion_page_url?: string;
  import_source?: string;
  imported_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Contacts ────────────────────────────────────────────────────────────────

export interface SupplierContact {
  id?: string;
  supplier_id: string;
  full_name: string;
  job_title?: string;
  department?: string;
  contact_role?: string;
  phone?: string;
  mobile?: string;
  whatsapp?: string;
  wechat?: string;
  email?: string;
  preferred_language?: string;
  is_primary?: boolean;
  is_decision_maker?: boolean;
  is_commercial_contact?: boolean;
  is_technical_contact?: boolean;
  is_finance_contact?: boolean;
  is_logistics_contact?: boolean;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Products ────────────────────────────────────────────────────────────────

export interface SupplierProduct {
  id?: string;
  supplier_id: string;
  supplier_sku?: string;
  product_name_cn?: string;
  product_name_en?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  specification?: string;
  material?: string;
  model?: string;
  unit?: string;
  moq?: number;
  default_currency?: string;
  indicative_price_min?: number;
  indicative_price_max?: number;
  price_basis?: string;
  default_incoterm?: string;
  lead_time_days?: number;
  country_of_origin?: string;
  hs_code?: string;
  oem_available?: boolean;
  odm_available?: boolean;
  private_label_available?: boolean;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Services ────────────────────────────────────────────────────────────────

export interface SupplierService {
  id?: string;
  supplier_id: string;
  service_name: string;
  service_category?: string;
  service_description?: string;
  pricing_model?: string;
  minimum_fee?: number;
  currency?: string;
  service_area?: string;
  coverage_countries?: string[];
  lead_time?: string;
  terms?: string;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Documents ───────────────────────────────────────────────────────────────

export type DocumentType =
  | '营业执照' | '公司注册文件' | 'VAT文件' | '税务文件' | '公司简介'
  | '产品目录' | '产品规格书' | '检测报告' | '报价原件' | '合同' | 'NDA'
  | '银行资料' | '工厂照片' | '审厂报告' | '认证证书' | '其他';

export type DocumentVerificationStatus = 'unverified' | 'verified' | 'rejected' | 'pending_reupload';

export interface SupplierDocument {
  id?: string;
  supplier_id: string;
  certification_id?: string;
  is_primary?: boolean;
  document_type: DocumentType;
  document_name: string;
  storage_bucket?: string;
  storage_path?: string;
  file_url?: string;
  mime_type?: string;
  file_size?: number;
  document_number?: string;
  issuing_authority?: string;
  issue_date?: string;
  expire_date?: string;
  verification_status?: DocumentVerificationStatus;
  verified_by?: string;
  verified_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Certifications ──────────────────────────────────────────────────────────

export type CertificationStatus =
  | 'available'           // 已有
  | 'not_available'       // 没有
  | 'pending_verification'// 待核实
  | 'not_applicable'      // 不适用
  | 'expired';            // 已过期

export const CERT_STATUS_LABEL: Record<CertificationStatus, string> = {
  available:            '已有',
  not_available:        '没有',
  pending_verification: '待核实',
  not_applicable:       '不适用',
  expired:              '已过期',
};

export interface SupplierCertification {
  id?: string;
  supplier_id: string;
  certification_type: string;
  certification_number?: string;
  status: CertificationStatus;
  issuing_body?: string;
  issue_date?: string;
  expire_date?: string;
  market_scope?: string;
  scope_description?: string;
  verification_status?: string;
  verified_by?: string;
  verified_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Cert–Product link ───────────────────────────────────────────────────────

export interface CertProductLink {
  id?: string;
  certification_id: string;
  supplier_product_id?: string;
  covered_model?: string;
  covered_scope?: string;
  created_at?: string;
}

// ── Aggregated detail ───────────────────────────────────────────────────────

export interface SupplierDetail extends Supplier {
  contacts: SupplierContact[];
  products: SupplierProduct[];
  services: SupplierService[];
  documents: SupplierDocument[];
  certifications: SupplierCertification[];
}
