-- GCI Company Documents — Intelligence V2 Phase 1: AI recognition fields
-- Idempotent, safe to re-run. All new columns nullable — no historical row is
-- touched or backfilled. expiry_date already existed (20260907 migration) and
-- is reused as-is, not duplicated. No existing column is renamed or dropped.
-- ALREADY EXECUTED IN PRODUCTION — kept in sync with what was actually run
-- there (the UPDATE RLS policy below matches Production exactly, see its own
-- comment — it is row-owner-scoped, not the wider "any authenticated user"
-- version this file originally shipped with).

alter table public.company_documents
  add column if not exists document_type text,
  add column if not exists company_name text,
  add column if not exists document_number text,
  add column if not exists issue_date date,
  add column if not exists issuing_authority text,
  add column if not exists ai_summary text,
  add column if not exists ai_extracted jsonb,
  add column if not exists ai_status text,
  add column if not exists ai_confidence numeric,
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists last_ai_processed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_documents_ai_status_check'
  ) then
    alter table public.company_documents
      add constraint company_documents_ai_status_check
      check (ai_status is null or ai_status in ('pending', 'processing', 'completed', 'failed', 'needs_review'));
  end if;
end $$;

create index if not exists idx_company_documents_ai_status on public.company_documents(ai_status);
create index if not exists idx_company_documents_expiry_reminder
  on public.company_documents(expiry_date) where reminder_enabled = true;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — UPDATE narrowed to row ownership, not "any authenticated user can
-- update any row". Reason: the AI recognize-then-confirm flow needs the
-- uploader (who may not be an Admin, per the existing "any authenticated
-- user can upload" policy) to be able to save their own upload's reviewed AI
-- fields back onto the row they just created — but that doesn't require
-- letting them edit anyone else's document. is_active_admin() still bypasses
-- the ownership check, same as it always has for this table. Before this
-- round, UPDATE was Active-Admin-only and genuinely unused by the app
-- (updateCompanyDocumentMetadata() existed but had no calling UI) — this is
-- the first real UPDATE path. DELETE stays Active-Admin-only, untouched.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Active admins can update company documents" on public.company_documents;
drop policy if exists "Authenticated users can update own company documents" on public.company_documents;
create policy "Authenticated users can update own company documents"
on public.company_documents
for update
to authenticated
using (
  is_active_admin()
  or uploaded_by = auth.uid()
)
with check (
  is_active_admin()
  or uploaded_by = auth.uid()
);
