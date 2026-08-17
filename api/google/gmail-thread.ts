// /api/google/gmail-thread — read-only full Gmail thread fetch (Task 11.1).
// gmail.readonly only. Never sends, archives, deletes, labels, or drafts.
// HTML bodies are converted to plain text server-side — never returned as
// executable HTML, and never rendered as HTML by the client.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json, extractHeader } from './_googleAuth';

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

// Minimal, dependency-free HTML→text conversion. Strips script/style blocks
// entirely, converts common block-level tags to line breaks, strips all
// remaining tags, and decodes common entities. This text is for display and
// for feeding to the AI as data — it is never re-parsed as HTML.
function stripHtml(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function walkParts(
  payload: any,
  acc: { textPlain: string; textHtml: string; attachments: Attachment[] },
): void {
  if (!payload) return;
  const { mimeType, filename, body, parts } = payload;
  if (filename && body?.attachmentId) {
    acc.attachments.push({ filename, mimeType: mimeType || 'application/octet-stream', size: body.size ?? 0 });
  } else if (mimeType === 'text/plain' && body?.data) {
    try { acc.textPlain += decodeBase64Url(body.data); } catch { /* skip unparseable part */ }
  } else if (mimeType === 'text/html' && body?.data) {
    try { acc.textHtml += decodeBase64Url(body.data); } catch { /* skip unparseable part */ }
  }
  if (parts) for (const p of parts) walkParts(p, acc);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const threadId = url.searchParams.get('threadId');
  if (!threadId) return json({ ok: false, error: 'threadId is required' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const data = await res.json();
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'Gmail thread fetch failed' }, 500);

    const messages = (data.messages || []).map((m: any) => {
      const headers = m.payload?.headers;
      const acc = { textPlain: '', textHtml: '', attachments: [] as Attachment[] };
      walkParts(m.payload, acc);
      const body = acc.textPlain.trim() || (acc.textHtml ? stripHtml(acc.textHtml) : '') || m.snippet || '';
      return {
        id: m.id,
        from: extractHeader(headers, 'From'),
        to: extractHeader(headers, 'To'),
        subject: extractHeader(headers, 'Subject'),
        date: extractHeader(headers, 'Date'),
        snippet: m.snippet || '',
        body,
        attachments: acc.attachments,
      };
    });

    return json({ ok: true, threadId, messages });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
