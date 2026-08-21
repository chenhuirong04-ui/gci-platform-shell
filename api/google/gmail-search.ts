// /api/google/gmail-search — read-only Gmail search.
// gmail.readonly only. Never sends, archives, deletes, or relabels anything.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json, extractHeader, fetchMessagesMetadataChunked } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  // Ceiling raised 15 -> 60 for the Email Assistant's 30-day scoped list
  // (Task: summary-first redesign). Default stays 8 — every existing caller
  // that doesn't pass max= is unaffected.
  const max = Math.min(Number(url.searchParams.get('max')) || 8, 60);
  if (!q) return json({ ok: false, error: 'Missing q' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const listData = await listRes.json();
    if (!listRes.ok) return json({ ok: false, error: listData?.error?.message || 'Gmail search failed' }, 500);

    const ids: string[] = (listData.messages || []).map((m: any) => m.id);
    const metas = await fetchMessagesMetadataChunked(ids, auth.accessToken);
    const results = metas.map((m: any) => {
      const headers = m.payload?.headers;
      return {
        id: m.id,
        threadId: m.threadId,
        sender: extractHeader(headers, 'From'),
        subject: extractHeader(headers, 'Subject'),
        date: extractHeader(headers, 'Date'),
        snippet: m.snippet || '',
        link: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
        unread: Array.isArray(m.labelIds) && m.labelIds.includes('UNREAD'),
      };
    });

    return json({ ok: true, query: q, results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
