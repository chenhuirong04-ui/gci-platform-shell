-- GCI Executive Desk — Task 8: Decision Inbox / 老板审批箱
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Records Chris's decisions on judgment-required items surfaced from the
-- Boss Action Center (Task 7). This table only stores what Chris decided —
-- nothing here ever triggers an external action (no email, CRM write,
-- payment, deletion, etc.). No workflow engine, minimal shape only.

create table if not exists executive_decisions (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null,             -- crm | business | systems | email | agents
  source_ref            text not null,             -- stable id for idempotency, e.g. "quote-<id>"
  category              text,
  title                 text not null,
  summary               text,
  reason                text not null,              -- "为什么这件事需要老板决定"
  priority              text not null default 'P2', -- P1 | P2 | P3
  status                text not null default 'pending', -- pending | decided | dismissed
  decision_options      jsonb not null default '[]'::jsonb,
  selected_option       text,
  decision_note         text,
  related_customer_id   uuid,
  related_system_id     uuid,
  due_at                timestamptz,
  created_at            timestamptz not null default now(),
  decided_at            timestamptz,
  decided_by            uuid
);

alter table executive_decisions enable row level security;

create policy "executive_decisions_select"
  on executive_decisions for select
  using (auth.uid() is not null);

create policy "executive_decisions_insert"
  on executive_decisions for insert
  with check (auth.uid() is not null);

create policy "executive_decisions_update"
  on executive_decisions for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_ed_status   on executive_decisions(status);
create index if not exists idx_ed_source   on executive_decisions(source);
create index if not exists idx_ed_priority on executive_decisions(priority);

-- Idempotency (same source + source_ref must not get a second PENDING row)
-- is enforced at the application layer (apps/shell/src/lib/decisionInbox.ts)
-- rather than a DB unique constraint, so a source_ref can legitimately get a
-- new decision row in the future after a prior one is resolved.
create index if not exists idx_ed_source_ref on executive_decisions(source, source_ref, status);
