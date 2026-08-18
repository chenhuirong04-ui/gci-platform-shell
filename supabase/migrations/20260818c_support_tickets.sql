-- GCI Executive Desk — Task 18.2: GIA Support Inbox — support_tickets
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Additive only — no drop/delete/truncate, no change to any existing
-- table (crm_customers/crm_contacts/crm_followups/etc. untouched).
-- No delete policy — tickets are never physically removed, only their
-- status changes.

create table if not exists support_tickets (
  id                     uuid primary key default gen_random_uuid(),
  channel                text not null default 'email',   -- email | whatsapp
  customer_name          text,
  customer_email         text,
  customer_phone         text,
  product                text not null default 'OTHER',   -- CHANYA | 25H_AI | TRADE | WORKFORCE | ECOMMERCE | GCI | OTHER
  issue_type             text not null default 'OTHER',   -- PAYMENT | SUBSCRIPTION | LOGIN | INVITE | MINUTES_USAGE | BILLING | TECHNICAL | ACCOUNT | GENERAL | OTHER
  priority               text not null default 'P3',      -- P1 | P2 | P3
  raw_content            text not null,
  summary_zh             text,
  why_important          text,
  system_status_context  text,                            -- what GIA read from Chanya/etc. when judging, for transparency
  suggested_action       text,
  needs_chris            boolean not null default false,
  status                 text not null default 'open',    -- open | in_progress | resolved
  source_thread_id       text,                            -- Gmail threadId, if created from an email
  source_message_id      text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  resolved_at            timestamptz
);

alter table support_tickets enable row level security;

create policy "support_tickets_select"
  on support_tickets for select
  using (auth.uid() is not null);

create policy "support_tickets_insert"
  on support_tickets for insert
  with check (auth.uid() is not null);

create policy "support_tickets_update"
  on support_tickets for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_support_tickets_status on support_tickets(status);
create index if not exists idx_support_tickets_needs_chris on support_tickets(needs_chris);
create index if not exists idx_support_tickets_priority on support_tickets(priority);
create index if not exists idx_support_tickets_product on support_tickets(product);
create index if not exists idx_support_tickets_created_at on support_tickets(created_at);
