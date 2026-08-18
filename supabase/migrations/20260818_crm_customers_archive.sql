-- GCI Executive Desk — CRM Customer Archive (minimal soft-deactivate)
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Additive only — no drop/delete/truncate, no change to any existing
-- column or row data. Every existing customer defaults to is_active=true
-- (default applies to already-existing rows too, since a NOT NULL column
-- added with a DEFAULT backfills existing rows with that default value —
-- no existing customer data changes meaning).

alter table crm_customers
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz null,
  add column if not exists archive_reason text null;

-- No new RLS policy — existing select/insert/update policies already
-- cover these new columns (RLS applies at the row level, not per-column).
-- No delete policy is added; crm_customers still has none.
