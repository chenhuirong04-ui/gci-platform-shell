-- GCI Company Documents — Accounts & Logins: screenshot/attachment support
-- Lightweight table linked to company_account_logins, plus its own private
-- Storage bucket. File bytes live in Storage only — never base64 in the
-- database. Same Admin-only access boundary as the parent table (reuses
-- is_active_admin()). Does NOT touch company_account_logins itself, the
-- vault encryption endpoints, or any other RLS.
-- Idempotent, safe to re-run. NOT YET EXECUTED — review before running in
-- Supabase SQL Editor.

create table if not exists public.company_account_login_attachments (
  id                uuid primary key default gen_random_uuid(),
  account_login_id  uuid not null references public.company_account_logins(id) on delete cascade,
  file_name         text not null,
  storage_path      text not null,
  mime_type         text,
  file_size         bigint,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null
);

create index if not exists idx_account_login_attachments_login
  on public.company_account_login_attachments(account_login_id);

create or replace function public.company_account_login_attachments_set_created_meta()
returns trigger
language plpgsql
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_account_login_attachments_created_meta on public.company_account_login_attachments;
create trigger trg_account_login_attachments_created_meta
before insert on public.company_account_login_attachments
for each row execute function public.company_account_login_attachments_set_created_meta();

alter table public.company_account_login_attachments enable row level security;

grant select, insert, delete on table public.company_account_login_attachments to authenticated;

drop policy if exists "Admins can view account login attachments" on public.company_account_login_attachments;
create policy "Admins can view account login attachments"
on public.company_account_login_attachments for select to authenticated using (public.is_active_admin());

drop policy if exists "Admins can insert account login attachments" on public.company_account_login_attachments;
create policy "Admins can insert account login attachments"
on public.company_account_login_attachments for insert to authenticated with check (public.is_active_admin());

drop policy if exists "Admins can delete account login attachments" on public.company_account_login_attachments;
create policy "Admins can delete account login attachments"
on public.company_account_login_attachments for delete to authenticated using (public.is_active_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- Storage bucket (private — never public; access only via createSignedUrl())
-- Path convention: account-logins/{account_login_id}/{uuid}{ext}
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('account-vault-attachments', 'account-vault-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Admins can read account-vault-attachments files" on storage.objects;
create policy "Admins can read account-vault-attachments files"
on storage.objects for select to authenticated
using (bucket_id = 'account-vault-attachments' and public.is_active_admin());

drop policy if exists "Admins can upload account-vault-attachments files" on storage.objects;
create policy "Admins can upload account-vault-attachments files"
on storage.objects for insert to authenticated
with check (bucket_id = 'account-vault-attachments' and public.is_active_admin());

drop policy if exists "Admins can delete account-vault-attachments files" on storage.objects;
create policy "Admins can delete account-vault-attachments files"
on storage.objects for delete to authenticated
using (bucket_id = 'account-vault-attachments' and public.is_active_admin());
