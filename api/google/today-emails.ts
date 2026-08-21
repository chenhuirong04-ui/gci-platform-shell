// /api/google/today-emails — the ONE unified "today's real Gmail inbox"
// source. Both the Home KPIs and Email Assistant's default view read from
// this exact function — no separate queries, no separate caps, no fake
// fallback numbers. Real Gmail data only; if Gmail is unreachable this
// returns { ok: false }, never a stale/hardcoded count.
//
// "Today" = Asia/Dubai calendar day. Gmail's own after:/before: operators
// use the account's configured timezone, which may not be Dubai, so this
// queries a safely wider 2-day window and filters precisely to today's
// Dubai date itself (same +4h-shift-then-slice pattern used everywhere
// else in this app for calendar-day bucketing).
//
// Performance: an earlier version of a similar route did one unbounded
// Promise.all over up to 60 message ids and hit a Vercel Edge 504
// (FUNCTION_INVOCATION_TIMEOUT). This route (a) scopes to 2 days instead
// of 30, keeping N small, (b) paginates the list call instead of relying
// on a single fixed maxResults, so the count is never silently truncated,
// and (c) fetches per-message metadata in bounded-concurrency chunks via
// fetchMessagesMetadataChunked — never a single unbounded batch.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json, extractHeader, fetchMessagesMetadataChunked } from './_googleAuth';

const QUERY = 'newer_than:2d in:inbox';
const PAGE_SIZE = 100;
const MAX_IDS = 300; // safety cap — far above any realistic 2-day inbox

function dubaiDateStr(dateHeader: string): string {
  const d = new Date(dateHeader);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function todayDubaiStr(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    // Paginate the list call — a fixed maxResults alone would silently
    // truncate the count on a busy inbox, which is exactly the "always 15"
    // bug this round exists to remove.
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({ q: QUERY, maxResults: String(PAGE_SIZE) });
      if (pageToken) qs.set('pageToken', pageToken);
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${qs.toString()}`,
        { headers: { Authorization: `Bearer ${auth.accessToken}` } },
      );
      const listData = await listRes.json();
      if (!listRes.ok) return json({ ok: false, error: listData?.error?.message || 'Gmail query failed' }, 500);
      ids.push(...(listData.messages || []).map((m: any) => m.id));
      pageToken = listData.nextPageToken;
    } while (pageToken && ids.length < MAX_IDS);

    const metas = await fetchMessagesMetadataChunked(ids, auth.accessToken);
    const today = todayDubaiStr();

    const results = metas
      .map((m: any) => {
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
      })
      .filter((m) => dubaiDateStr(m.date) === today)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return json({ ok: true, date: today, results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
