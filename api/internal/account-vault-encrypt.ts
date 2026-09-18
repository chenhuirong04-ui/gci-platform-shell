// /api/internal/account-vault-encrypt
// POST { password: string }
// Admin-only. Encrypts one password with AES-256-GCM using ACCOUNT_VAULT_KEY
// (server-side only, never sent to the client) and returns the ciphertext +
// IV for the caller to store on the company_account_logins row via the
// normal Supabase client (RLS on that table is itself Admin-only, so this
// endpoint only needs to keep the encryption key off the client — storage
// access control is enforced by the DB, not by this endpoint).
// Returns { ok: true, ciphertext, iv } or { ok: false, error }
export const config = { runtime: 'edge' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function b64encode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function importVaultKey(): Promise<CryptoKey> {
  const keyB64 = process.env.ACCOUNT_VAULT_KEY;
  if (!keyB64) throw new Error('ACCOUNT_VAULT_KEY not configured');
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
}

// Resolves the caller's own Supabase session to a user id, then checks
// role_label='Admin' AND is_active=true via the service role key (bypasses
// RLS — this check IS the access boundary here, mirrors is_active_admin()).
// Never logs the token or password. Never trusts a client-asserted role.
async function requireAdmin(request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Missing Authorization header' };

  const SUPA_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SERVICE_KEY) return { ok: false, status: 500, error: 'server_config_missing' };

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

  const { password } = body;
  if (typeof password !== 'string' || !password) {
    return json({ ok: false, error: 'Missing required field: password' }, 400);
  }

  try {
    const key = await importVaultKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(password);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return json({
      ok: true,
      ciphertext: b64encode(new Uint8Array(encrypted)),
      iv: b64encode(iv),
    });
  } catch (e: any) {
    // Never include the password or key in the error response.
    return json({ ok: false, error: e?.message === 'ACCOUNT_VAULT_KEY not configured' ? e.message : 'Encryption failed' }, 500);
  }
}
