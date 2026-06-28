/**
 * GCI Service Quote — Cloud Storage (Supabase)
 * Tables: service_categories, service_catalog_items, service_quotes, service_quote_items
 *
 * Standalone module — does not read/write supplier_quotes, supplier_quote_items, or any
 * Package Quote / configurator data. Safe to deploy without touching Module 1/2/3.
 *
 * IMPORTANT — one-time setup: run the SQL in `SERVICE_QUOTE_SETUP_SQL` (bottom of this file)
 * in the Supabase SQL editor before using this module. Nothing here auto-creates tables.
 */

const SUPA_URL = "https://efrkvwhzpgahjgfukjth.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU";

// ── Types ────────────────────────────────────────────────────────────────────

export type ServiceBillingType =
  | 'fixed' | 'monthly' | 'quarterly' | 'yearly'
  | 'per_cbm' | 'per_kg' | 'per_unit' | 'per_shipment'
  | 'percentage' | 'commission' | 'custom';

export const BILLING_TYPE_LABELS: Record<ServiceBillingType, string> = {
  fixed: '固定价格 Fixed',
  monthly: '月费 Monthly',
  quarterly: '季度费 Quarterly',
  yearly: '年费 Yearly',
  per_cbm: '按CBM计费 Per CBM',
  per_kg: '按KG计费 Per KG',
  per_unit: '按件计费 Per Unit',
  per_shipment: '按票计费 Per Shipment',
  percentage: '百分比收费 Percentage',
  commission: '成功佣金 Commission',
  custom: '自定义 Custom',
};

export const PAYMENT_TERM_OPTIONS = [
  '100%预付款 100% Advance',
  '50% + 50%',
  '30% + 70%',
  '月付 Monthly',
  '季付 Quarterly',
  '年付 Yearly',
  '成功佣金 Success Commission',
  '自定义 Custom',
];

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
  default_billing_type: ServiceBillingType;
  sort_order: number;
  active: boolean;
}

export interface ServiceQuote {
  id?: string;
  quote_no: string;
  customer_name: string;
  contact_person?: string;
  quote_date?: string;
  currency: string;
  project_duration?: string;
  payment_terms?: string;
  notes?: string;
  status: 'Draft' | 'Final';
  total_amount: number;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceQuoteItem {
  id?: string;
  service_quote_id?: string;
  category_name: string;
  service_name: string;
  description?: string;
  unit: string;
  quantity: number;
  unit_price: number;
  billing_type: ServiceBillingType;
  billing_label?: string;
  line_total: number;
  sort_order: number;
}

// ── Internal fetch ────────────────────────────────────────────────────────────

async function sbFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const headers: Record<string, string> = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  };
  try {
    const res = await fetch(`${SUPA_URL}${path}`, { ...init, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[serviceQuoteCloud] ${res.status} :: ${txt}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error('[serviceQuoteCloud] Network error:', e);
    return null;
  }
}

export function generateServiceQuoteNo(): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `SVC-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;
}

// ── Catalog (admin-managed — adding a service here never requires a code change) ──

export async function listServiceCategories(): Promise<ServiceCategory[]> {
  const res = await sbFetch('/rest/v1/service_categories?order=sort_order.asc', { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function addServiceCategory(cat: ServiceCategory): Promise<ServiceCategory | null> {
  const res = await sbFetch('/rest/v1/service_categories', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cat),
  });
  if (!res) return null;
  const saved = await res.json().catch(() => null);
  return Array.isArray(saved) ? saved[0] : saved;
}

export async function deleteServiceCategory(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_categories?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

export async function listServiceCatalogItems(): Promise<ServiceCatalogItem[]> {
  const res = await sbFetch('/rest/v1/service_catalog_items?active=eq.true&order=sort_order.asc', { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function addServiceCatalogItem(item: ServiceCatalogItem): Promise<ServiceCatalogItem | null> {
  const res = await sbFetch('/rest/v1/service_catalog_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(item),
  });
  if (!res) return null;
  const saved = await res.json().catch(() => null);
  return Array.isArray(saved) ? saved[0] : saved;
}

export async function updateServiceCatalogItem(id: string, patch: Partial<ServiceCatalogItem>): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_catalog_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  return res !== null;
}

export async function deleteServiceCatalogItem(id: string): Promise<boolean> {
  const res = await sbFetch(`/rest/v1/service_catalog_items?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

// ── Service Quotes ─────────────────────────────────────────────────────────────

export async function saveServiceQuote(
  quote: ServiceQuote,
  items: ServiceQuoteItem[]
): Promise<string | null> {
  const res = await sbFetch('/rest/v1/service_quotes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(quote),
  });
  if (!res) return null;
  const saved = await res.json().catch(() => null);
  const savedQuote = Array.isArray(saved) ? saved[0] : saved;
  const id: string = savedQuote?.id;
  if (!id) return null;

  if (items.length > 0) {
    const rows = items.map((it, i) => ({ ...it, service_quote_id: id, sort_order: i }));
    await sbFetch('/rest/v1/service_quote_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
  }
  return id;
}

export async function listServiceQuotes(limit = 60): Promise<ServiceQuote[]> {
  const res = await sbFetch(`/rest/v1/service_quotes?order=created_at.desc&limit=${limit}`, { method: 'GET' });
  if (!res) return [];
  return res.json().catch(() => []);
}

export async function loadServiceQuote(
  id: string
): Promise<{ quote: ServiceQuote; items: ServiceQuoteItem[] } | null> {
  const [qRes, iRes] = await Promise.all([
    sbFetch(`/rest/v1/service_quotes?id=eq.${encodeURIComponent(id)}&limit=1`, { method: 'GET' }),
    sbFetch(`/rest/v1/service_quote_items?service_quote_id=eq.${encodeURIComponent(id)}&order=sort_order.asc`, { method: 'GET' }),
  ]);
  if (!qRes) return null;
  const quotes = await qRes.json().catch(() => []);
  if (!quotes.length) return null;
  const items: ServiceQuoteItem[] = iRes ? await iRes.json().catch(() => []) : [];
  return { quote: quotes[0], items };
}

export async function deleteServiceQuote(id: string): Promise<boolean> {
  await sbFetch(`/rest/v1/service_quote_items?service_quote_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  const res = await sbFetch(`/rest/v1/service_quotes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res !== null;
}

// ── Default catalog seed (used once, only if the catalog is empty) ───────────────
// This is a STARTING POINT, not a hardcoded list — once seeded, all future services
// (e.g. "沙特公司注册", "EPCF服务") are added via addServiceCategory/addServiceCatalogItem
// (wired to the in-app Catalog Manager), never by editing this file again.

const DEFAULT_CATALOG: { name_cn: string; name_en: string; items: { name_cn: string; name_en: string; unit: string; billing: ServiceBillingType }[] }[] = [
  {
    name_cn: '企业服务', name_en: 'Corporate Services',
    items: [
      { name_cn: '公司注册', name_en: 'Company Registration', unit: '次', billing: 'fixed' },
      { name_cn: '自贸区公司注册', name_en: 'Free Zone Company Registration', unit: '次', billing: 'fixed' },
      { name_cn: '非自贸区公司注册', name_en: 'Mainland Company Registration', unit: '次', billing: 'fixed' },
      { name_cn: '公司续牌', name_en: 'License Renewal', unit: '次', billing: 'yearly' },
      { name_cn: '公司变更', name_en: 'Company Amendment', unit: '次', billing: 'fixed' },
      { name_cn: '公司转让', name_en: 'Company Transfer', unit: '次', billing: 'fixed' },
      { name_cn: '公司注销', name_en: 'Company Deregistration', unit: '次', billing: 'fixed' },
      { name_cn: '投资签证', name_en: 'Investor Visa', unit: '人', billing: 'fixed' },
      { name_cn: '工作签证', name_en: 'Work Visa', unit: '人', billing: 'fixed' },
      { name_cn: '家庭签证', name_en: 'Family Visa', unit: '人', billing: 'fixed' },
      { name_cn: '黄金签证', name_en: 'Golden Visa', unit: '人', billing: 'fixed' },
      { name_cn: 'Emirates ID', name_en: 'Emirates ID', unit: '人', billing: 'fixed' },
      { name_cn: '银行开户', name_en: 'Bank Account Opening', unit: '次', billing: 'fixed' },
      { name_cn: 'VAT注册', name_en: 'VAT Registration', unit: '次', billing: 'fixed' },
      { name_cn: 'VAT申报', name_en: 'VAT Filing', unit: '次', billing: 'quarterly' },
      { name_cn: '企业所得税注册', name_en: 'Corporate Tax Registration', unit: '次', billing: 'fixed' },
      { name_cn: '企业所得税申报', name_en: 'Corporate Tax Filing', unit: '次', billing: 'yearly' },
      { name_cn: '记账服务', name_en: 'Bookkeeping Service', unit: '月', billing: 'monthly' },
      { name_cn: '审计服务', name_en: 'Audit Service', unit: '次', billing: 'yearly' },
      { name_cn: '合规服务', name_en: 'Compliance Service', unit: '月', billing: 'monthly' },
    ],
  },
  {
    name_cn: '市场进入与商务拓展', name_en: 'Market Entry & Business Development',
    items: [
      { name_cn: '市场调研', name_en: 'Market Research', unit: '次', billing: 'fixed' },
      { name_cn: '市场进入方案', name_en: 'Market Entry Strategy', unit: '次', billing: 'fixed' },
      { name_cn: '经销商开发', name_en: 'Distributor Development', unit: '次', billing: 'fixed' },
      { name_cn: '合作伙伴寻找', name_en: 'Partner Sourcing', unit: '次', billing: 'fixed' },
      { name_cn: '客户开发', name_en: 'Customer Development', unit: '月', billing: 'monthly' },
      { name_cn: '商务对接', name_en: 'Business Matchmaking', unit: '次', billing: 'fixed' },
      { name_cn: '商务考察', name_en: 'Business Trip Arrangement', unit: '次', billing: 'fixed' },
      { name_cn: '展会支持', name_en: 'Exhibition Support', unit: '次', billing: 'fixed' },
      { name_cn: '政府资源协调', name_en: 'Government Liaison', unit: '次', billing: 'fixed' },
      { name_cn: '商业代表服务', name_en: 'Business Representative Service', unit: '月', billing: 'monthly' },
    ],
  },
  {
    name_cn: '项目服务', name_en: 'Project Services',
    items: [
      { name_cn: '土地寻找', name_en: 'Land Sourcing', unit: '次', billing: 'fixed' },
      { name_cn: '厂房寻找', name_en: 'Factory Sourcing', unit: '次', billing: 'fixed' },
      { name_cn: '仓库寻找', name_en: 'Warehouse Sourcing', unit: '次', billing: 'fixed' },
      { name_cn: '办公室寻找', name_en: 'Office Sourcing', unit: '次', billing: 'fixed' },
      { name_cn: '工业园区对接', name_en: 'Industrial Park Liaison', unit: '次', billing: 'fixed' },
      { name_cn: 'EPC项目协调', name_en: 'EPC Project Coordination', unit: '月', billing: 'monthly' },
      { name_cn: 'FF&E项目协调', name_en: 'FF&E Project Coordination', unit: '月', billing: 'monthly' },
      { name_cn: '项目执行协调', name_en: 'Project Execution Coordination', unit: '月', billing: 'monthly' },
      { name_cn: '采购协调', name_en: 'Procurement Coordination', unit: '次', billing: 'percentage' },
      { name_cn: '工程协调', name_en: 'Engineering Coordination', unit: '月', billing: 'monthly' },
      { name_cn: '现场考察安排', name_en: 'Site Visit Arrangement', unit: '次', billing: 'fixed' },
    ],
  },
  {
    name_cn: '海外仓与物流服务', name_en: 'Overseas Warehouse & Logistics',
    items: [
      { name_cn: '海外仓服务', name_en: 'Overseas Warehouse Service', unit: '月', billing: 'monthly' },
      { name_cn: '共享仓服务', name_en: 'Shared Warehouse Service', unit: 'CBM', billing: 'per_cbm' },
      { name_cn: '独立仓服务', name_en: 'Dedicated Warehouse Service', unit: '月', billing: 'monthly' },
      { name_cn: '临时仓储', name_en: 'Temporary Storage', unit: 'CBM', billing: 'per_cbm' },
      { name_cn: '长期仓储', name_en: 'Long-term Storage', unit: 'CBM', billing: 'monthly' },
      { name_cn: '收货验货', name_en: 'Receiving & Inspection', unit: '票', billing: 'per_shipment' },
      { name_cn: '集货服务', name_en: 'Consolidation Service', unit: '票', billing: 'per_shipment' },
      { name_cn: '分拣服务', name_en: 'Sorting Service', unit: 'KG', billing: 'per_kg' },
      { name_cn: '打包服务', name_en: 'Packing Service', unit: '件', billing: 'per_unit' },
      { name_cn: '贴标服务', name_en: 'Labeling Service', unit: '件', billing: 'per_unit' },
      { name_cn: '换包装服务', name_en: 'Repackaging Service', unit: '件', billing: 'per_unit' },
      { name_cn: '库存管理', name_en: 'Inventory Management', unit: '月', billing: 'monthly' },
      { name_cn: '本地配送协调', name_en: 'Local Delivery Coordination', unit: '票', billing: 'per_shipment' },
      { name_cn: 'GCC转运协调', name_en: 'GCC Transshipment Coordination', unit: '票', billing: 'per_shipment' },
      { name_cn: '逆向物流', name_en: 'Reverse Logistics', unit: '票', billing: 'per_shipment' },
    ],
  },
  {
    name_cn: '供应链服务', name_en: 'Supply Chain Services',
    items: [
      { name_cn: '供应商开发', name_en: 'Supplier Development', unit: '次', billing: 'fixed' },
      { name_cn: '工厂审核', name_en: 'Factory Audit', unit: '次', billing: 'fixed' },
      { name_cn: '产品采购', name_en: 'Product Sourcing', unit: '次', billing: 'percentage' },
      { name_cn: '采购管理', name_en: 'Procurement Management', unit: '月', billing: 'monthly' },
      { name_cn: '验货服务', name_en: 'Quality Inspection', unit: '次', billing: 'per_shipment' },
      { name_cn: '品控服务', name_en: 'Quality Control Service', unit: '月', billing: 'monthly' },
      { name_cn: '出口协调', name_en: 'Export Coordination', unit: '票', billing: 'per_shipment' },
      { name_cn: '物流协调', name_en: 'Logistics Coordination', unit: '票', billing: 'per_shipment' },
      { name_cn: '供应商管理', name_en: 'Supplier Management', unit: '月', billing: 'monthly' },
    ],
  },
  {
    name_cn: 'AI数字化解决方案', name_en: 'AI & Digital Solutions',
    items: [
      { name_cn: 'AI工作流设计', name_en: 'AI Workflow Design', unit: '次', billing: 'fixed' },
      { name_cn: 'CRM系统搭建', name_en: 'CRM System Setup', unit: '次', billing: 'fixed' },
      { name_cn: 'Dashboard系统搭建', name_en: 'Dashboard System Setup', unit: '次', billing: 'fixed' },
      { name_cn: '企业自动化流程', name_en: 'Enterprise Automation', unit: '次', billing: 'fixed' },
      { name_cn: 'AI Agent开发', name_en: 'AI Agent Development', unit: '次', billing: 'fixed' },
      { name_cn: '商业智能系统', name_en: 'Business Intelligence System', unit: '次', billing: 'fixed' },
      { name_cn: '报价系统开发', name_en: 'Quotation System Development', unit: '次', billing: 'fixed' },
      { name_cn: '企业数字化转型咨询', name_en: 'Digital Transformation Consulting', unit: '月', billing: 'monthly' },
      { name_cn: '定制软件开发', name_en: 'Custom Software Development', unit: '次', billing: 'fixed' },
    ],
  },
];

/** Seeds the default catalog ONLY if service_categories is currently empty. Idempotent. */
export async function seedDefaultCatalogIfEmpty(): Promise<void> {
  const existing = await listServiceCategories();
  if (existing.length > 0) return;
  for (let ci = 0; ci < DEFAULT_CATALOG.length; ci++) {
    const cat = DEFAULT_CATALOG[ci];
    const saved = await addServiceCategory({ name_cn: cat.name_cn, name_en: cat.name_en, sort_order: ci });
    if (!saved?.id) continue;
    for (let ii = 0; ii < cat.items.length; ii++) {
      const it = cat.items[ii];
      await addServiceCatalogItem({
        category_id: saved.id, name_cn: it.name_cn, name_en: it.name_en,
        default_unit: it.unit, default_billing_type: it.billing, sort_order: ii, active: true,
      });
    }
  }
}

// ── One-time Supabase setup ────────────────────────────────────────────────────
// Run this once in the Supabase SQL editor. Not executed by the app.
export const SERVICE_QUOTE_SETUP_SQL = `
create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  name_cn text not null,
  name_en text not null,
  sort_order int not null default 0
);

create table if not exists service_catalog_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references service_categories(id) on delete cascade,
  name_cn text not null,
  name_en text not null,
  default_unit text not null default '项',
  default_billing_type text not null default 'fixed',
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists service_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null,
  customer_name text not null,
  contact_person text,
  quote_date date,
  currency text not null default 'AED',
  project_duration text,
  payment_terms text,
  notes text,
  status text not null default 'Draft',
  total_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_quote_items (
  id uuid primary key default gen_random_uuid(),
  service_quote_id uuid references service_quotes(id) on delete cascade,
  category_name text,
  service_name text not null,
  description text,
  unit text not null default '项',
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  billing_type text not null default 'fixed',
  billing_label text,
  line_total numeric not null default 0,
  sort_order int not null default 0
);

alter table service_categories enable row level security;
alter table service_catalog_items enable row level security;
alter table service_quotes enable row level security;
alter table service_quote_items enable row level security;

create policy "anon all" on service_categories for all using (true) with check (true);
create policy "anon all" on service_catalog_items for all using (true) with check (true);
create policy "anon all" on service_quotes for all using (true) with check (true);
create policy "anon all" on service_quote_items for all using (true) with check (true);
`;
