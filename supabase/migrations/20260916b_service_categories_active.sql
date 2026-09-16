-- GCI Business Solutions — Service Category lifecycle (active) field
-- Idempotent: safe to re-run. Does not DELETE any row, does not touch
-- service_quotes / service_quote_items (historical quotes are untouched).
-- Run in Supabase SQL Editor.

-- ── 1. Add the column ────────────────────────────────────────────────────────
alter table service_categories
  add column if not exists active boolean not null default true;

create index if not exists idx_scat_active on service_categories(active);

-- ── 2. Take the 3 approved categories offline ──────────────────────────────────
-- 市场进入与商务拓展 / Market Entry & Business Development
-- 项目服务 / Project Services
-- 海外仓与物流服务 / Overseas Warehouse & Logistics
update service_categories
set active = false
where name_cn in ('市场进入与商务拓展', '项目服务', '海外仓与物流服务');
