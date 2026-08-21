// GCI Executive Desk — shared Google OAuth token helper (Task 5.2).
// Server-side only. Never returns the refresh token, never logs any token.
// Access tokens are short-lived and re-fetched per request (edge functions
// are stateless — no in-memory cache survives between invocations).

export async function getGoogleAccessToken(): Promise<
  { ok: true; accessToken: string } | { ok: false; error: string }
> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, error: 'Google OAuth not fully configured (missing client id / secret / refresh token).' };
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      // Never echo the raw error body verbatim (may reference credentials).
      return { ok: false, error: data?.error_description || data?.error || 'Failed to refresh Google access token.' };
    }
    return { ok: true, accessToken: data.access_token as string };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Gmail-only helpers (extractHeader, fetchMessagesMetadataChunked) removed
// with the rest of GCI/GIA's email capability (final product decision) —
// their only callers (gmail-search.ts, gmail-thread.ts) are deleted.
// getGoogleAccessToken/CORS/json above are shared by Drive and file-intake
// endpoints and are untouched.
