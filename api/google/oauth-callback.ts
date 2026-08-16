// /api/google/oauth-callback
// Exchanges the authorization code for tokens server-side. Never returns,
// logs, or stores the refresh_token — it's shown to Google's servers and to
// this function only, both server-side. The browser only ever sees a
// success/failure message, never the token value.
//
// Task 5.1 scope: this endpoint does NOT persist the refresh token anywhere
// (no Vercel API write access, no Supabase write). It confirms one was
// issued and tells the operator to copy it into GOOGLE_REFRESH_TOKEN by hand.
export const config = { runtime: 'edge' };

function page(title: string, body: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
    <body style="font-family: system-ui; background:#0A1628; color:#E8F0FF; padding:48px;">
      <h2 style="color:${ok ? '#6FBF8E' : '#E0846A'};">${title}</h2>
      <p>${body}</p>
    </body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return page('OAuth failed', `Google returned an error: ${oauthError}`, false);
  }
  if (!code) {
    return page('OAuth failed', 'No authorization code was returned by Google.', false);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return page('OAuth failed', 'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in Vercel Production env vars.', false);
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
      return page('OAuth failed', `Token exchange failed: ${tokenData?.error ?? 'unknown error'} — ${tokenData?.error_description ?? ''}`, false);
    }

    const hasRefreshToken = typeof tokenData.refresh_token === 'string' && tokenData.refresh_token.length > 0;

    // Never log or return the actual token value.
    if (hasRefreshToken) {
      return page(
        'OAuth successful',
        'Refresh token generated; manually store it in GOOGLE_REFRESH_TOKEN (Vercel → gci-platform-shell → Environment Variables → Production). ' +
        'This page does not display or log the token value.',
        true,
      );
    }

    return page(
      'OAuth successful (no new refresh token)',
      'Google did not return a new refresh_token this time — this happens when this Google account already has an active grant for this app. ' +
      'To force a fresh refresh_token, revoke this app\'s access at myaccount.google.com/permissions, then run /api/google/oauth-start again.',
      true,
    );
  } catch (e: any) {
    return page('OAuth failed', `Unexpected error during token exchange: ${String(e?.message ?? e)}`, false);
  }
}
