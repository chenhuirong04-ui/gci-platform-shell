-- GCI Executive Desk — Task 16: Business To-Do / executive_tasks
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Lightweight capture pool for business items that are real but aren't a
-- customer follow-up (crm_followups), an explicit promise (executive_
-- commitments), or a judgment call (executive_decisions). No project
-- management fields (no milestones/sprints/dependencies/assignees beyond
-- Chris) — deliberately minimal per Task 16 §七/§九.

create table if not exists executive_tasks (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  business_area         text not null default 'OTHER', -- 25H_AI | TRADE | WORKFORCE | ECOMMERCE | COMPANY_ADMIN | OTHER
  status                text not null default 'open',   -- open | in_progress | completed | cancelled
  priority              text not null default 'P3',     -- P1 | P2 | P3
  due_at                timestamptz,
  reminder_at           timestamptz,
  related_customer_id   uuid references crm_customers(id) on delete set null,
  source                text not null default 'business_assistant',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz
);

alter table executive_tasks enable row level security;

create policy "executive_tasks_select"
  on executive_tasks for select
  using (auth.uid() is not null);

create policy "executive_tasks_insert"
  on executive_tasks for insert
  with check (auth.uid() is not null);

create policy "executive_tasks_update"
  on executive_tasks for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_et_status        on executive_tasks(status);
create index if not exists idx_et_business_area on executive_tasks(business_area);
create index if not exists idx_et_due_at        on executive_tasks(due_at);
create index if not exists idx_et_related_customer on executive_tasks(related_customer_id);
