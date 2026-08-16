// /api/google/oauth-start
// Redirects to Google's OAuth consent screen. Read-only scopes only
// (Gmail/Drive/Calendar readonly) — no send/write/modify scopes requested.
// Server-side only: GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI never reach the browser.
export const config = { runtime: 'edge' };

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export default async function handler(): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI in Vercel Production env vars.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',      // forces refresh_token even on repeat authorization
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}
