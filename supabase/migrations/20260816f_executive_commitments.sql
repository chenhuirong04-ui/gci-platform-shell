-- GCI Executive Desk — Task 10: Executive Memory / Commitment Tracker
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Tracks explicit commitments (what Chris promised customers, what customers
-- promised Chris, what the team promised, what a Decision's next step is).
-- Read/record only — nothing here ever triggers an external action.
-- Same authenticated-only RLS pattern as executive_decisions.
--
-- Note on `status`: application code only ever writes 'open' | 'completed' |
-- 'cancelled'. 'overdue' is a DERIVED display state (status='open' AND
-- due_at is in the past, computed at read time using the real current
-- instant) — it is never written to this column, to avoid a daily batch job.

create table if not exists executive_commitments (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  commitment_type       text not null,              -- outbound | inbound | internal
  source                text not null,               -- crm | gmail | decision | calendar | manual
  source_ref            text,
  related_customer_id   uuid,
  related_decision_id   uuid,
  counterparty          text,
  owner                 text,
  commitment_text       text not null,
  due_at                timestamptz,
  status                text not null default 'open', -- open | completed | cancelled
  priority              text not null default 'P2',   -- P1 | P2 | P3
  source_link           text,
  completion_note       text,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz,
  updated_at            timestamptz not null default now()
);

alter table executive_commitments enable row level security;

create policy "executive_commitments_select"
  on executive_commitments for select
  using (auth.uid() is not null);

create policy "executive_commitments_insert"
  on executive_commitments for insert
  with check (auth.uid() is not null);

create policy "executive_commitments_update"
  on executive_commitments for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_ec_status       on executive_commitments(status);
create index if not exists idx_ec_source       on executive_commitments(source);
create index if not exists idx_ec_due_at       on executive_commitments(due_at);
create index if not exists idx_ec_source_ref   on executive_commitments(source, source_ref);
create index if not exists idx_ec_decision_id  on executive_commitments(related_decision_id);
