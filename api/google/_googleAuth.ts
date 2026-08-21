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

export function extractHeader(headers: any[] | undefined, name: string): string {
  const h = headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

// Fetches per-message metadata for a list of Gmail message ids with bounded
// concurrency (chunks, not one giant Promise.all over everything) — an
// unbounded Promise.all over ~60 ids was confirmed to cause a Vercel Edge
// 504 (FUNCTION_INVOCATION_TIMEOUT). One message failing to fetch is
// dropped (null, filtered out), never fails the whole batch.
export async function fetchMessagesMetadataChunked(
  ids: string[],
  accessToken: string,
  chunkSize = 8,
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          const r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      }),
    );
    out.push(...results.filter(Boolean));
  }
  return out;
}
