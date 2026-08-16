// /api/google/gmail-search — read-only Gmail search.
// gmail.readonly only. Never sends, archives, deletes, or relabels anything.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json, extractHeader } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const max = Math.min(Number(url.searchParams.get('max')) || 8, 15);
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
    const results = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${auth.accessToken}` } },
        );
        if (!r.ok) return null;
        const m = await r.json();
        const headers = m.payload?.headers;
        return {
          id: m.id,
          threadId: m.threadId,
          sender: extractHeader(headers, 'From'),
          subject: extractHeader(headers, 'Subject'),
          date: extractHeader(headers, 'Date'),
          snippet: m.snippet || '',
          link: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
        };
      }),
    );

    return json({ ok: true, query: q, results: results.filter(Boolean) });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
