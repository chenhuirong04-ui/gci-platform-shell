// /api/google/oauth-callback
// Exchanges the authorization code for tokens server-side. This is a
// ONE-TIME result page: on success it shows the refresh_token exactly once
// so the operator can copy it into Vercel's GOOGLE_REFRESH_TOKEN env var —
// this endpoint does not persist the token anywhere itself (no Supabase
// write, no file write, no localStorage, no third party, no query string,
// no console.log). Cache-Control: no-store on every response.
export const config = { runtime: 'edge' };

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function page(title: string, bodyHtml: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
    <body style="font-family: system-ui; background:#0A1628; color:#E8F0FF; padding:48px; max-width:720px; margin:0 auto;">
      <h2 style="color:${ok ? '#6FBF8E' : '#E0846A'};">${escapeHtml(title)}</h2>
      ${bodyHtml}
    </body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS } },
  );
}

function simpleMessagePage(title: string, message: string, ok: boolean) {
  return page(title, `<p>${escapeHtml(message)}</p>`, ok);
}

// Renders the refresh token in a read-only textbox with a Copy button.
// The token is inlined into this one response only — never logged, never
// written anywhere else, never put in a URL.
function refreshTokenPage(token: string) {
  const safeToken = escapeHtml(token);
  return page(
    'OAuth successful',
    `
    <p>Refresh token generated. <strong>Copy this token now and store it as GOOGLE_REFRESH_TOKEN in Vercel Production.</strong></p>
    <p style="color:#D4A843;">This page will not show this token again — it is not saved anywhere by this app.</p>
    <textarea id="rt" readonly rows="4" style="width:100%; box-sizing:border-box; padding:10px; font-family: IBM Plex Mono, monospace; font-size:13px; background:#111; color:#E8F0FF; border:1px solid #333; border-radius:8px;">${safeToken}</textarea>
    <button onclick="navigator.clipboard.writeText(document.getElementById('rt').value); this.textContent='Copied!';"
      style="margin-top:12px; padding:10px 18px; border-radius:8px; background:#CBA85C; border:none; color:#080D1E; font-weight:700; cursor:pointer;">
      Copy
    </button>
    `,
    true,
  );
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return simpleMessagePage('OAuth failed', `Google returned an error: ${oauthError}`, false);
  }
  if (!code) {
    return simpleMessagePage('OAuth failed', 'No authorization code was returned by Google.', false);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return simpleMessagePage('OAuth failed', 'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in Vercel Production env vars.', false);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      // Never include tokenData verbatim — it can echo back client_secret-adjacent fields on some errors.
      return simpleMessagePage('OAuth failed', `Token exchange failed: ${tokenData?.error ?? 'unknown error'} — ${tokenData?.error_description ?? ''}`, false);
    }

    const refreshToken: unknown = tokenData.refresh_token;
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      return refreshTokenPage(refreshToken);
    }

    return simpleMessagePage(
      'No refresh token returned',
      'No refresh token returned. Revoke previous consent or rerun OAuth with prompt=consent and access_type=offline.',
      false,
    );
  } catch (e: any) {
    return simpleMessagePage('OAuth failed', `Unexpected error during token exchange: ${String(e?.message ?? e)}`, false);
  }
}
