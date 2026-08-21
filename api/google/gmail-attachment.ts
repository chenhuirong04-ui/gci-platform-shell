// /api/google/gmail-attachment — read-only Gmail attachment byte fetch.
// gmail.readonly only (same scope gmail-thread.ts already uses — no new
// consent). Never sends, deletes, or modifies anything. Only ever called
// with a messageId+attachmentId the client already has from an explicit
// attachment the user is looking at (gmail-thread.ts's walkParts()) — this
// endpoint never searches or guesses which message/attachment to fetch.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

const MAX_BYTES = 25 * 1024 * 1024; // matches drive-upload-file.ts's cap

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const messageId = url.searchParams.get('messageId');
  const attachmentId = url.searchParams.get('attachmentId');
  if (!messageId || !attachmentId) return json({ ok: false, error: 'messageId and attachmentId are required' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const data = await res.json();
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'Gmail attachment fetch failed' }, 500);
    if (typeof data.size === 'number' && data.size > MAX_BYTES) {
      return json({ ok: false, error: '附件超过 25MB，本轮暂不支持。' }, 400);
    }

    // Gmail returns base64url — convert to standard base64 so the client
    // can decode it with atob()/Buffer without a second transform.
    const base64 = String(data.data || '').replace(/-/g, '+').replace(/_/g, '/');
    return json({ ok: true, data: base64, size: data.size ?? 0 });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
