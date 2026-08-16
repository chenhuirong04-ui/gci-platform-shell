-- GCI Executive Desk — Task 6: Development Systems Registry
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Discovery/record-keeping only. No deletion capability anywhere in this migration.

create table if not exists executive_system_registry (
  id                     uuid primary key default gen_random_uuid(),
  system_name            text not null,
  category               text,   -- internal | product | template | agent | legacy | experiment
  lifecycle_status       text,   -- production | development | paused | legacy | archived | unknown
  github_repo            text,
  github_branch          text,
  latest_commit          text,
  vercel_project         text,
  production_url         text,
  staging_url            text,
  supabase_project_name  text,
  supabase_project_ref   text,
  local_machine          text,
  local_path             text,
  replaced_by            text,
  replaces               text,
  data_status            text,
  last_verified_at       timestamptz,
  notes                  text,
  deletion_status        text default 'unknown',  -- do_not_delete | review | safe_candidate | unknown
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table executive_system_registry enable row level security;

create policy "executive_system_registry_select"
  on executive_system_registry for select
  using (auth.uid() is not null);

create policy "executive_system_registry_insert"
  on executive_system_registry for insert
  with check (auth.uid() is not null);

create policy "executive_system_registry_update"
  on executive_system_registry for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_esr_lifecycle_status on executive_system_registry(lifecycle_status);
create index if not exists idx_esr_deletion_status on executive_system_registry(deletion_status);
create index if not exists idx_esr_category on executive_system_registry(category);

-- ── First batch: confirmed-only entries (Task 6 scope — no account-wide scan) ──
-- Unconfirmed fields are left NULL, never guessed.

insert into executive_system_registry
  (system_name, category, lifecycle_status, github_repo, github_branch, vercel_project,
   production_url, supabase_project_name, supabase_project_ref, notes, deletion_status, last_verified_at)
values
  ('GCI Platform', 'internal', 'production',
   'chenhuirong04-ui/gci-platform-shell', 'main', 'gci-platform-shell',
   'https://app.globalcareinfo.com', 'gci-trade-260521', 'efrkvwhzpgahjgfukjth',
   null, 'do_not_delete', now()),

  ('Chanya / 25H Bridge', 'product', 'production',
   null, null, '25h-bridge',
   'https://chanya.globalcareinfo.com', '25h-bridge', 'fieqffsqvptweetfzvkh',
   null, 'do_not_delete', now()),

  ('Chanya Growth Agent', 'agent', 'production',
   null, null, 'chanya-growth-agent-v1',
   'https://chanya-growth-agent-v1.vercel.app', '25h-bridge (shared)', 'fieqffsqvptweetfzvkh',
   'Uses growth_* tables inside the Chanya/25H Bridge shared database — not its own Supabase project.',
   'review', now()),

  ('MIA / GCI AI Sales Agent', 'agent', 'production',
   'chenhuirong04-ui/GCI-AI-Sales-Agent', 'main', 'gci-ai-sales-agent',
   'https://gci-ai-sales-agent.vercel.app', null, null,
   'Production is login-gated; Supabase project ref not confirmed (Vercel env var is locked/sensitive).',
   'review', now()),

  ('CRM Template', 'template', 'development',
   null, null, null,
   null, null, null,
   '对外销售模板，不是 GCI 内部正式 CRM 主数据源(正式 CRM 数据源是 gci-trade-260521 的 crm_customers/crm_contacts/crm_followups)。',
   'unknown', now())
on conflict do nothing;
