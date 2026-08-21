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
  const accessToken = auth.accessToken;

  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  // Generic noise exclusion — source/config file extensions almost never
  // matter for a business-document search and otherwise crowd out the real
  // match purely by being recently touched. Not specific to any one file.
  const noiseExclusion = "not name contains '.json' and not name contains '.js' and not name contains '.ts'";
  const FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink)';

  async function runQuery(driveQuery: string) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&fields=${FIELDS}&orderBy=modifiedTime%20desc&pageSize=${max}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    if (!res.ok) return { ok: false as const, error: data?.error?.message || 'Drive search failed' };
    return { ok: true as const, results: data.files || [] };
  }

  try {
    // Tier 1 — precise: every query word must appear in the file NAME
    // (AND, not OR). "GCI 营业执照" only matches a file whose title actually
    // has both, e.g. "营业执照GCI LICENSE..." — a title match on all terms
    // is a much stronger relevance signal than any single word appearing
    // somewhere in file content, so this is checked first.
    if (words.length > 0) {
      const nameAndClause = words.map((w) => `name contains '${esc(w)}'`).join(' and ');
      const tier1 = await runQuery(`${nameAndClause} and ${noiseExclusion} and trashed = false`);
      if (!tier1.ok) return json({ ok: false, error: tier1.error }, 500);
      if (tier1.results.length > 0) return json({ ok: true, query: q, results: tier1.results });
    }

    // Tier 2 — fallback: broader OR across name/fullText, same noise
    // exclusion, only reached when no file's title matched every term.
    const clauses = words.flatMap((w) => [`name contains '${esc(w)}'`, `fullText contains '${esc(w)}'`]);
    const tier2 = await runQuery(`(${clauses.join(' or ')}) and ${noiseExclusion} and trashed = false`);
    if (!tier2.ok) return json({ ok: false, error: tier2.error }, 500);
    return json({ ok: true, query: q, results: tier2.results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
