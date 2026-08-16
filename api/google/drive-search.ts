// /api/google/drive-search — read-only Drive search.
// drive.readonly only. Never downloads full file contents, never moves,
// renames, or deletes anything, never copies files into Supabase.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const max = Math.min(Number(url.searchParams.get('max')) || 10, 20);
  if (!q) return json({ ok: false, error: 'Missing q' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  // OR query across the first few keywords, matching filename or full text.
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const clauses = words.flatMap((w) => [`name contains '${esc(w)}'`, `fullText contains '${esc(w)}'`]);
  const driveQuery = `(${clauses.join(' or ')}) and trashed = false`;

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime%20desc&pageSize=${max}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const data = await res.json();
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'Drive search failed' }, 500);

    return json({ ok: true, query: q, results: data.files || [] });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
