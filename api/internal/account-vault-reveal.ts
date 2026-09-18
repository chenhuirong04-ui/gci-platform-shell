// /api/internal/account-vault-reveal
// POST { id: string }
// Admin-only. Looks up ONE company_account_logins row by id via the service
// role (so the ciphertext/iv columns never have to be selectable by the
// client at all — the browser never receives them, only ever the plaintext
// result of this one explicit "显示密码" click), decrypts server-side with
// ACCOUNT_VAULT_KEY, and returns only the plaintext password. Never logs the
// password or the key. Nothing here is cached.
// Returns { ok: true, password } or { ok: false, error }
export const config = { runtime: 'edge' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function b64decode(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function importVaultKey(): Promise<CryptoKey> {
  const keyB64 = process.env.ACCOUNT_VAULT_KEY;
  if (!keyB64) throw new Error('ACCOUNT_VAULT_KEY not configured');
  const raw = b64decode(keyB64);
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['decrypt']);
}

// Same caller-verification as account-vault-encrypt.ts (kept self-contained
// per this repo's existing api/ convention — see that file's own comment).
async function requireAdmin(request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Missing Authorization header' };

  // Not secret — same project URL already baked into the client bundle as
  // VITE_SUPABASE_URL. Hardcoded rather than read from a plain SUPABASE_URL
  // env var, which isn't set in this Vercel project.
  const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return { ok: false, status: 500, error: 'server_config_missing' };

  const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid or expired session' };
  const user = await userRes.json().catch(() => null);
  const userId = user?.id;
  if (!userId) return { ok: false, status: 401, error: 'Invalid session' };

  const profileRes = await fetch(
    `${SUPA_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=role_label,is_active&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!profileRes.ok) return { ok: false, status: 500, error: 'profile_lookup_failed' };
  const rows = await profileRes.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.is_active !== true || profile.role_label !== 'Admin') {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const admin = await requireAdmin(request);
  if (!admin.ok) return json({ ok: false, error: admin.error }, admin.status);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const { id } = body;
  if (typeof id !== 'string' || !id) {
    return json({ ok: false, error: 'Missing required field: id' }, 400);
  }

  const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const rowRes = await fetch(
    `${SUPA_URL}/rest/v1/company_account_logins?id=eq.${encodeURIComponent(id)}&select=password_ciphertext,password_iv&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!rowRes.ok) return json({ ok: false, error: 'Lookup failed' }, 502);
  const rows = await rowRes.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.password_ciphertext || !row.password_iv) {
    return json({ ok: false, error: 'No password stored for this account' }, 404);
  }

  try {
    const key = await importVaultKey();
    const ciphertext = b64decode(row.password_ciphertext);
    const iv = b64decode(row.password_iv);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return json({ ok: true, password: new TextDecoder().decode(decrypted) });
  } catch {
    return json({ ok: false, error: 'Decryption failed' }, 500);
  }
}
