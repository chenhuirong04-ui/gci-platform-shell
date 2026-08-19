-- GCI Executive Desk — GIA WhatsApp Intake V1
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Additive only — no drop/delete/truncate, no change to any existing
-- table. No delete policy — messages are never physically removed.
--
-- Why this table is needed: checked crm_followups/executive_tasks/
-- support_tickets first per your instruction — none of them can hold a
-- durable, persistent message_id dedup key or the raw inbound payload
-- (crm_followups requires a non-null customer_id, so an unmatched contact's
-- message can't live there at all). This table is the one new place a raw
-- WhatsApp message is captured; crm_followups/executive_tasks/
-- support_tickets stay exactly as they are — this table only links to
-- whichever one the message got routed into.
--
-- RLS note: this table is written by two different actors with two
-- different privilege levels —
--   1. The webhook itself (api/whatsapp/webhook.ts) runs with no Chris
--      session at all (Meta calls it directly), so it can't satisfy
--      `auth.uid() is not null`. It writes using the Supabase
--      SERVICE_ROLE key (server-side only, bypasses RLS entirely — never
--      exposed to the frontend). That's why there is deliberately NO
--      insert policy for the 'authenticated' role below.
--   2. Chris's own logged-in session (Support Inbox / Ask GCI) only ever
--      reads and updates (e.g. marking classification/summary corrections) —
--      covered by the select/update policies below.

create table if not exists whatsapp_messages (
  id                    uuid primary key default gen_random_uuid(),
  message_id            text not null unique,       -- WhatsApp's own message id — the real dedup key
  phone                 text not null,               -- digits only, WhatsApp's own "from" format
  contact_name          text,                        -- WhatsApp profile name, if provided
  message_type          text not null default 'text', -- text | image | document | audio | video | other
  text_content          text not null,               -- extracted/normalized text (captions/filenames folded in for non-text types)
  media_id              text,
  wa_timestamp          timestamptz not null,         -- the message's own timestamp, from WhatsApp
  customer_id           uuid references crm_customers(id) on delete set null,  -- null when contact isn't in CRM yet ("未识别联系人") — never auto-created
  classification         text,                        -- general_chat | new_inquiry | support | quotation | payment | complaint
  summary_zh             text,                        -- GIA's Chinese summary
  suggested_action       text,
  priority                text,                        -- P1 | P2 | P3
  linked_followup_id     uuid references crm_followups(id) on delete set null,
  linked_task_id          uuid references executive_tasks(id) on delete set null,
  linked_ticket_id        uuid references support_tickets(id) on delete set null,
  raw_payload             jsonb,                       -- full original webhook payload, for audit/debugging
  created_at              timestamptz not null default now()
);

alter table whatsapp_messages enable row level security;

create policy "whatsapp_messages_select"
  on whatsapp_messages for select
  using (auth.uid() is not null);

create policy "whatsapp_messages_update"
  on whatsapp_messages for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_wa_msg_customer_id  on whatsapp_messages(customer_id);
create index if not exists idx_wa_msg_phone        on whatsapp_messages(phone);
create index if not exists idx_wa_msg_created_at   on whatsapp_messages(created_at);
create index if not exists idx_wa_msg_classification on whatsapp_messages(classification);
