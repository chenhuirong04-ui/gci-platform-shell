-- GCI Executive Desk — GIA Foundation Part B: Business Memory
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Long-lived business rules Chris dictates ("记住…" / "以后都按这个…" / "这个业务
-- 规则是…") — pricing rules, service models, fixed processes, company rules,
-- product rules. Not a chat log: only confirmed rules are written here, one
-- row per rule. Additive only — no drop/delete/truncate, no change to any
-- existing table. No delete policy is added; retired rules are flipped to
-- is_active=false, never removed, so history is never lost.

create table if not exists gia_business_memory (
  id             uuid primary key default gen_random_uuid(),
  category       text not null,             -- pricing | service_model | process | company_rule | product_rule | other
  title          text not null,             -- short human label, e.g. "肯尼亚保姆报价规则"
  content        text not null,             -- the rule itself, in Chris's own words / a light paraphrase
  business_area  text,                      -- e.g. 25H_AI | TRADE | WORKFORCE | ECOMMERCE | COMPANY_ADMIN | OTHER
  company_name   text,                      -- which entity/company this rule applies to, if scoped (e.g. Highway)
  customer_id    uuid references crm_customers(id) on delete set null,  -- if scoped to one customer
  raw_fragment   text,                      -- the original dictated text this rule was captured from
  is_active      boolean not null default true,
  source         text not null default 'business_assistant',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table gia_business_memory enable row level security;

create policy "gia_business_memory_select"
  on gia_business_memory for select
  using (auth.uid() is not null);

create policy "gia_business_memory_insert"
  on gia_business_memory for insert
  with check (auth.uid() is not null);

create policy "gia_business_memory_update"
  on gia_business_memory for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_gbm_category      on gia_business_memory(category);
create index if not exists idx_gbm_business_area  on gia_business_memory(business_area);
create index if not exists idx_gbm_company_name   on gia_business_memory(company_name);
create index if not exists idx_gbm_customer_id    on gia_business_memory(customer_id);
create index if not exists idx_gbm_is_active      on gia_business_memory(is_active);
