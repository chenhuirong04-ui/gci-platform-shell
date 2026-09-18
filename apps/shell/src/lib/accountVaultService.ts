import { supabase } from './supabase';

// GCI Company Documents — Accounts & Logins (账号与登录). Tracks credentials
// for the company's EXTERNAL systems (EmaraTax, Dubai Trade, JAFZA, DEWA,
// banks, Hostinger, Google, etc.) — not GCI app staff/module permissions.
// See supabase/migrations/20260918_company_account_logins.sql. RLS on the
// table is Admin-only for every operation. The password is never stored or
// transmitted in plaintext except as the direct result of an explicit
// "显示密码" reveal click — see revealPassword() below.

export type MfaMethod = 'sms_otp' | 'email_otp' | 'uae_pass' | 'authenticator' | 'none';
export type AccountLoginStatus = 'active' | 'pending' | 'issue' | 'disabled';

export interface AccountLogin {
  id: string;
  platform_name: string;
  company_name: string;
  login_url: string | null;
  username: string | null;
  login_email: string | null;
  // Deliberately no password_ciphertext/password_iv here — list/detail reads
  // never select those columns (see fetchAccountLogins below), so the
  // browser never holds ciphertext at all, only ever a revealed plaintext
  // result held in local component state.
  has_password: boolean;
  phone: string | null;
  recovery_email: string | null;
  mfa_method: MfaMethod;
  owner: string | null;
  status: AccountLoginStatus;
  last_verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = 'id,platform_name,company_name,login_url,username,login_email,phone,recovery_email,mfa_method,owner,status,last_verified_at,notes,created_at,updated_at,password_ciphertext';

function mapRow(row: any): AccountLogin {
  const { password_ciphertext, ...rest } = row;
  return { ...rest, has_password: !!password_ciphertext };
}

export async function fetchAccountLogins(): Promise<AccountLogin[]> {
  const { data, error } = await supabase
    .from('company_account_logins')
    .select(SELECT_COLUMNS)
    .order('company_name', { ascending: true })
    .order('platform_name', { ascending: true });
  if (error || !data) return [];
  return data.map(mapRow);
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Encrypts a password server-side (the encryption key never reaches this
// client) and returns ciphertext+iv for the caller to include in the normal
// create/update payload below. Admin-gated by the endpoint itself.
export async function encryptPassword(password: string): Promise<
  { ok: true; ciphertext: string; iv: string } | { ok: false; error: string }
> {
  try {
    const headers = await authHeader();
    const res = await fetch('/api/internal/account-vault-encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ password }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) return { ok: false, error: payload?.error || `HTTP ${res.status}` };
    return { ok: true, ciphertext: payload.ciphertext, iv: payload.iv };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// "显示密码" — the only path that ever returns a plaintext password to the
// browser, one record at a time, on an explicit click. Admin-gated by the
// endpoint itself (re-checked server-side every call, not cached).
export async function revealPassword(id: string): Promise<
  { ok: true; password: string } | { ok: false; error: string }
> {
  try {
    const headers = await authHeader();
    const res = await fetch('/api/internal/account-vault-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ id }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) return { ok: false, error: payload?.error || `HTTP ${res.status}` };
    return { ok: true, password: payload.password };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export interface AccountLoginInput {
  platform_name: string;
  company_name: string;
  login_url: string;
  username: string;
  login_email: string;
  phone: string;
  recovery_email: string;
  mfa_method: MfaMethod;
  owner: string;
  status: AccountLoginStatus;
  last_verified_at: string;
  notes: string;
  // Plaintext, only ever held transiently in the edit form's own state —
  // encrypted via encryptPassword() before this function is called. Omitted
  // (undefined) on an edit where the user didn't change the password.
  newPasswordCiphertext?: string;
  newPasswordIv?: string;
}

function toRow(input: AccountLoginInput) {
  const row: Record<string, unknown> = {
    platform_name: input.platform_name.trim(),
    company_name: input.company_name.trim(),
    login_url: input.login_url.trim() || null,
    username: input.username.trim() || null,
    login_email: input.login_email.trim() || null,
    phone: input.phone.trim() || null,
    recovery_email: input.recovery_email.trim() || null,
    mfa_method: input.mfa_method,
    owner: input.owner.trim() || null,
    status: input.status,
    last_verified_at: input.last_verified_at || null,
    notes: input.notes.trim() || null,
  };
  if (input.newPasswordCiphertext && input.newPasswordIv) {
    row.password_ciphertext = input.newPasswordCiphertext;
    row.password_iv = input.newPasswordIv;
  }
  return row;
}

export async function createAccountLogin(input: AccountLoginInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('company_account_logins').insert(toRow(input));
  return { error: error ? error.message : null };
}

export async function updateAccountLogin(id: string, input: AccountLoginInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('company_account_logins').update(toRow(input)).eq('id', id);
  return { error: error ? error.message : null };
}
