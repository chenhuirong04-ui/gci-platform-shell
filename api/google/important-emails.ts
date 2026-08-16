// /api/google/important-emails — rule-based "needs Chris" inbox scan.
// Explainable rules only, no ML classification:
//   unread + last 7 days + excludes obvious bulk mail (promotions/social).
// CRM-relevance boosting is done client-side (this route has no Supabase
// access — it only knows about Gmail).
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json, extractHeader } from './_googleAuth';

const QUERY = 'is:unread newer_than:7d -category:promotions -category:social';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(QUERY)}&maxResults=15`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const listData = await listRes.json();
    if (!listRes.ok) return json({ ok: false, error: listData?.error?.message || 'Gmail query failed' }, 500);

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

    return json({ ok: true, rule: QUERY, results: results.filter(Boolean) });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
