-- GCI Executive Desk — GIA Learning / Memory V1
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Lightweight store for user-confirmed corrections GIA should reuse next
-- time, instead of re-guessing: Drive folder mapping (entity -> real
-- folderId), business area mapping (entity -> preferred TaskBusinessArea),
-- and entity alias (Round 2). Distinct from gia_business_memory, which is
-- freeform business-rule text (pricing/process/etc.) — this table is
-- structured key -> value_json lookups only.
-- Additive only — no drop/delete/truncate, no change to any existing
-- table. No delete policy is added; a superseded mapping is flipped to
-- is_active=false by application code, never removed, so history is never
-- lost (schema deliberately has no (memory_type,key) unique constraint —
-- multiple historical rows for the same key are expected and kept).

create table if not exists gia_memory (
  id            uuid primary key default gen_random_uuid(),
  memory_type   text not null,             -- drive_folder | business_area | entity_alias
  key           text not null,             -- normalized entity/keyword, e.g. "HIGHWAYGLOBAL" (normalization is the caller's job, not enforced here)
  value_json    jsonb not null,            -- e.g. {"folderId":"...","folderName":"..."} or {"businessArea":"WORKFORCE"}
  source        text not null,             -- user_correction | user_confirmation | manual
  confidence    numeric not null default 1.0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  constraint gia_memory_type_check
    check (memory_type in ('drive_folder', 'business_area', 'entity_alias')),
  constraint gia_memory_source_check
    check (source in ('user_correction', 'user_confirmation', 'manual'))
);

alter table gia_memory enable row level security;

create policy "gia_memory_select"
  on gia_memory for select
  using (auth.uid() is not null);

create policy "gia_memory_insert"
  on gia_memory for insert
  with check (auth.uid() is not null);

create policy "gia_memory_update"
  on gia_memory for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_gm_memory_type            on gia_memory(memory_type);
create index if not exists idx_gm_key                    on gia_memory(key);
create index if not exists idx_gm_is_active              on gia_memory(is_active);
create index if not exists idx_gm_type_key_active        on gia_memory(memory_type, key, is_active);
