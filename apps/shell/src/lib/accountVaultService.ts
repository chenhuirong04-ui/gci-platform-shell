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

export async function createAccountLogin(input: AccountLoginInput): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const { data, error } = await supabase.from('company_account_logins').insert(toRow(input)).select('id').single();
  if (error || !data) return { ok: false, error: error?.message || 'Insert failed' };
  return { ok: true, id: data.id };
}

export async function updateAccountLogin(id: string, input: AccountLoginInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('company_account_logins').update(toRow(input)).eq('id', id);
  return { error: error ? error.message : null };
}

// ─────────────────────────────────────────────────────────────────────────
// Attachments / screenshots — see
// supabase/migrations/20260918b_company_account_login_attachments.sql.
// File bytes live in the private 'account-vault-attachments' Storage bucket,
// never as base64 in the database — only metadata + storage_path here.
// Same Admin-only RLS boundary as company_account_logins itself.
// ─────────────────────────────────────────────────────────────────────────

const ATTACHMENT_BUCKET = 'account-vault-attachments';
export const ATTACHMENT_ACCEPT = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export interface AccountLoginAttachment {
  id: string;
  account_login_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export async function listAttachments(accountLoginId: string): Promise<AccountLoginAttachment[]> {
  const { data, error } = await supabase
    .from('company_account_login_attachments')
    .select('id,account_login_id,file_name,storage_path,mime_type,file_size,created_at')
    .eq('account_login_id', accountLoginId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as AccountLoginAttachment[];
}

function safeAttachmentExt(fileName: string): string {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : '';
}

// Uploads to Storage first, then inserts the metadata row. If the DB insert
// fails after a successful upload, the orphaned Storage object is removed so
// a failed attempt never leaves an untracked file behind (same convention as
// companyDocumentsService.ts's uploadCompanyDocument).
export async function uploadAttachment(accountLoginId: string, file: File): Promise<
  { ok: true; attachment: AccountLoginAttachment } | { ok: false; error: string }
> {
  const storagePath = `account-logins/${accountLoginId}/${crypto.randomUUID()}${safeAttachmentExt(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, file);
  if (uploadError) return { ok: false, error: `Storage: ${uploadError.message}` };

  const { data, error: dbError } = await supabase
    .from('company_account_login_attachments')
    .insert({
      account_login_id: accountLoginId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size: file.size,
    })
    .select('id,account_login_id,file_name,storage_path,mime_type,file_size,created_at')
    .single();
  if (dbError) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
    return { ok: false, error: `DB: ${dbError.message}` };
  }
  return { ok: true, attachment: data as AccountLoginAttachment };
}

export async function deleteAttachment(id: string, storagePath: string): Promise<{ error: string | null }> {
  const { error: storageError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
  if (storageError) return { error: `Storage: ${storageError.message}` };
  const { error: dbError } = await supabase.from('company_account_login_attachments').delete().eq('id', id);
  return { error: dbError ? `DB: ${dbError.message}` : null };
}

export async function getAttachmentSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
