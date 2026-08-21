// /api/google/oauth-start
// Redirects to Google's OAuth consent screen. Calendar stays read-only.
// Drive has two scopes: drive.readonly (unchanged — powers existing
// whole-Drive search in drive-search.ts/drive-list-folder.ts) PLUS
// drive.file (Task 17 GIA write permission — additive, NOT a replacement).
// drive.file only ever grants access to files GIA itself creates, or files
// the user explicitly hands over via Google Picker (future step) — it does
// not expand what GIA can read/write beyond that. No full `drive` scope.
// gmail.readonly removed (final product decision: no email capability
// anywhere in GCI/GIA) — Gmail-only scope, dropping it does not affect
// the Drive/Calendar token above.
// Server-side only: GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI never reach the browser.
export const config = { runtime: 'edge' };

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
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
