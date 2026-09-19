// Shared server-side auth for /api/* (Phase 1 security hardening).
//
// Browser → Authorization: Bearer <Supabase session token> → this helper
// validates the token with Supabase Auth, loads the caller's user_profiles
// row, checks is_active, then checks the required module / Admin role.
// Module semantics deliberately mirror the frontend's AuthContext.can():
// a plain `modules.includes(key)` check with NO Admin bypass — one
// permission system, not two. Admin-only checks use role_label === 'Admin'
// AND is_active, mirroring public.is_active_admin().
//
// The profile row is read with the CALLER'S OWN token (user_profiles RLS:
// users can read their own row), so no service-role key is needed here.
//
// Works for both Edge handlers (Web Request) and Node handlers
// (VercelRequest) — only `req.headers` is touched.
//
// API_AUTH_MODE=log turns enforcement into observe-only (logs what would
// have been denied, lets the request through). Default is enforce.

const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';

export interface AuthContext {
  userId: string;
  token: string;
  roleLabel: string;
  modules: string[];
  isAdmin: boolean;
}

// The deny-only fields are declared (as optional/undefined) on the allow
// variant too: Vercel type-checks api/ with strictNullChecks off, where
// `if (!r.ok)` does NOT narrow a boolean-discriminated union, so
// `r.status` / `r.response` must be reachable on the union itself.
export type AuthResult =
  | { ok: true; ctx: AuthContext; status?: undefined; body?: undefined; response?: undefined }
  | { ok: false; ctx?: undefined; status: number; body: { ok: false; error: string }; response: Response };

type AuthRule =
  | { kind: 'user' }
  | { kind: 'module'; modules: string[] }
  | { kind: 'admin' };

const OBSERVE_ONLY_CTX: AuthContext = { userId: '', token: '', roleLabel: '', modules: [], isAdmin: false };

// Short-lived per-isolate cache so a burst of calls from one page load
// doesn't pay 2 Supabase round trips each. Keyed by token, never logged.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 200;
const cache = new Map<string, { ctx: AuthContext; expires: number }>();

function readHeader(req: any, name: string): string {
  const h = req?.headers;
  if (!h) return '';
  if (typeof h.get === 'function') return h.get(name) || '';
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] || '' : v || '';
}

function fail(status: number, error: string): AuthResult {
  const body = { ok: false as const, error };
  return {
    ok: false,
    status,
    body,
    response: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }),
  };
}

async function loadContext(token: string): Promise<{ ctx: AuthContext } | { status: number; error: string }> {
  const cached = cache.get(token);
  if (cached && cached.expires > Date.now()) return { ctx: cached.ctx };

  const apikey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apikey) return { status: 500, error: 'server_config_missing' };

  let userRes: Response;
  try {
    userRes = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } });
  } catch {
    return { status: 502, error: 'auth_service_unreachable' };
  }
  if (!userRes.ok) return { status: 401, error: 'Invalid or expired session' };
  const user = await userRes.json().catch(() => null);
  const userId: string | undefined = user?.id;
  if (!userId) return { status: 401, error: 'Invalid session' };

  let profileRes: Response;
  try {
    profileRes = await fetch(
      `${SUPA_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=role_label,modules,is_active&limit=1`,
      { headers: { apikey, Authorization: `Bearer ${token}` } },
    );
  } catch {
    return { status: 502, error: 'auth_service_unreachable' };
  }
  if (!profileRes.ok) return { status: 500, error: 'profile_lookup_failed' };
  const rows = await profileRes.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.is_active !== true) return { status: 403, error: 'Account inactive or has no profile' };

  const ctx: AuthContext = {
    userId,
    token,
    roleLabel: profile.role_label || '',
    modules: Array.isArray(profile.modules) ? profile.modules : [],
    isAdmin: profile.role_label === 'Admin',
  };
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(token, { ctx, expires: Date.now() + CACHE_TTL_MS });
  return { ctx };
}

async function authorize(req: any, rule: AuthRule): Promise<AuthResult> {
  const denied = (status: number, error: string, userId = ''): AuthResult => {
    if (process.env.API_AUTH_MODE === 'log') {
      console.warn(`[api-auth] WOULD DENY ${status} ${error} user=${userId || '-'} path=${String(req?.url || '').split('?')[0]}`);
      return { ok: true, ctx: OBSERVE_ONLY_CTX };
    }
    return fail(status, error);
  };

  const token = readHeader(req, 'authorization').replace(/^Bearer\s+/i, '').trim();
  if (!token) return denied(401, 'Missing Authorization header');

  const loaded = await loadContext(token);
  if ('error' in loaded) return denied(loaded.status, loaded.error);
  const { ctx } = loaded;

  if (rule.kind === 'admin' && !ctx.isAdmin) return denied(403, 'Admin access required', ctx.userId);
  if (rule.kind === 'module' && !rule.modules.some((m) => ctx.modules.includes(m))) {
    return denied(403, 'Module access required', ctx.userId);
  }
  return { ok: true, ctx };
}

/**
 * Headers for a PostgREST / Storage call made AS the signed-in user, so RLS
 * applies to the query. `apikey` is the public project key (Supabase needs
 * it on every request to route it to the project; it grants no data access
 * by itself) — the identity is the caller's own access token in
 * Authorization. Never use the service-role key here.
 *
 * Only in API_AUTH_MODE=log (observe mode, no real token) does this fall
 * back to the anon key as Bearer — i.e. exactly the pre-hardening behaviour.
 */
export function userRestHeaders(ctx: AuthContext): Record<string, string> {
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return { apikey, Authorization: `Bearer ${ctx.token || apikey}` };
}

/**
 * TEMPORARY EXCEPTION — remove in Batch 3.
 * quotes, quote_items, orders, order_items, payments, settlements and
 * consignment_stock carry an `anon_all` policy scoped to role {anon} only
 * (the standalone Trade app reads/writes them with the anon key and has no
 * login). A signed-in user's token has role `authenticated`, which those
 * policies do NOT cover, so endpoints that read them must keep using the
 * anon key until Trade moves to login. Callers must already have passed a
 * requireUser / requireModule / requireAdmin check — the endpoint stays
 * authenticated; only its internal data access stays on the legacy identity.
 */
export function legacyTradeAnonHeaders(): Record<string, string> {
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return { apikey, Authorization: `Bearer ${apikey}` };
}

/** Any active user with a profile row. */
export function requireUser(req: any): Promise<AuthResult> {
  return authorize(req, { kind: 'user' });
}

/** Active user holding at least one of the given user_profiles.modules keys. */
export function requireModule(req: any, modules: string | string[]): Promise<AuthResult> {
  return authorize(req, { kind: 'module', modules: Array.isArray(modules) ? modules : [modules] });
}

/** Active user with role_label = 'Admin' (mirrors is_active_admin()). */
export function requireAdmin(req: any): Promise<AuthResult> {
  return authorize(req, { kind: 'admin' });
}
