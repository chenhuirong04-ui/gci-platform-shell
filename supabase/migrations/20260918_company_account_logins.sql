-- GCI Company Documents — Accounts & Logins (账号与登录)
-- Tracks login credentials for the company's EXTERNAL systems (EmaraTax,
-- Dubai Trade, JAFZA, DEWA, banks, Hostinger, Google, etc.) — NOT GCI app
-- staff/module permissions, which stay entirely in user_profiles/RLS as
-- before. This is a separate, narrowly-scoped table.
--
-- Security: the password is never stored in plaintext. Only
-- password_ciphertext + password_iv (AES-256-GCM, encrypted server-side by
-- api/internal/account-vault-*.ts — the encryption key never reaches the
-- client). Whole table is Admin-only (reuses the existing is_active_admin()
-- helper from 20260907_company_documents.sql) for every operation —
-- SELECT/INSERT/UPDATE/DELETE — not just the password field, since every
-- column here (usernames, recovery emails, phone numbers for government/
-- bank logins) is sensitive.
--
-- Idempotent, safe to re-run. NOT YET EXECUTED — review before running in
-- Supabase SQL Editor.

create table if not exists public.company_account_logins (
  id                    uuid primary key default gen_random_uuid(),
  platform_name         text not null,
  company_name          text not null,
  login_url             text,
  username              text,
  login_email           text,
  password_ciphertext   text,
  password_iv           text,
  phone                 text,
  recovery_email        text,
  mfa_method            text not null default 'none',
  owner                 text,
  status                text not null default 'pending',
  last_verified_at      timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null,
  updated_by            uuid references auth.users(id) on delete set null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_account_logins_mfa_method_check'
  ) then
    alter table public.company_account_logins
      add constraint company_account_logins_mfa_method_check
      check (mfa_method in ('sms_otp', 'email_otp', 'uae_pass', 'authenticator', 'none'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_account_logins_status_check'
  ) then
    alter table public.company_account_logins
      add constraint company_account_logins_status_check
      check (status in ('active', 'pending', 'issue', 'disabled'));
  end if;
end $$;

create index if not exists idx_company_account_logins_company on public.company_account_logins(company_name);
create index if not exists idx_company_account_logins_status on public.company_account_logins(status);

create or replace function public.company_account_logins_set_updated_meta()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_company_account_logins_updated_meta on public.company_account_logins;
create trigger trg_company_account_logins_updated_meta
before update on public.company_account_logins
for each row execute function public.company_account_logins_set_updated_meta();

create or replace function public.company_account_logins_set_created_meta()
returns trigger
language plpgsql
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_company_account_logins_created_meta on public.company_account_logins;
create trigger trg_company_account_logins_created_meta
before insert on public.company_account_logins
for each row execute function public.company_account_logins_set_created_meta();

alter table public.company_account_logins enable row level security;

grant select, insert, update, delete on table public.company_account_logins to authenticated;

drop policy if exists "Admins can view account logins" on public.company_account_logins;
create policy "Admins can view account logins"
on public.company_account_logins for select to authenticated using (public.is_active_admin());

drop policy if exists "Admins can insert account logins" on public.company_account_logins;
create policy "Admins can insert account logins"
on public.company_account_logins for insert to authenticated with check (public.is_active_admin());

drop policy if exists "Admins can update account logins" on public.company_account_logins;
create policy "Admins can update account logins"
on public.company_account_logins for update to authenticated
using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "Admins can delete account logins" on public.company_account_logins;
create policy "Admins can delete account logins"
on public.company_account_logins for delete to authenticated using (public.is_active_admin());
