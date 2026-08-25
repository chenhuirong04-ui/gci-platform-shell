// /api/google/drive-search — read-only Drive search.
// drive.readonly only. Never downloads full file contents, never moves,
// renames, or deletes anything, never copies files into Supabase.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  // Optional topic terms (e.g. document-type synonyms), comma-separated,
  // OR'd against each other but AND'd against `q` — see topicGroup() below.
  // Backward compatible: callers that never pass `topic` (e.g.
  // searchDriveFolders) get exactly the old q-only tiering, unchanged.
  const topicParam = url.searchParams.get('topic')?.trim();
  const max = Math.min(Number(url.searchParams.get('max')) || 10, 20);
  if (!q && !topicParam) return json({ ok: false, error: 'Missing q' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);
  const accessToken = auth.accessToken;

  const words = (q || '').split(/\s+/).filter(Boolean).slice(0, 3);
  const topicTerms = topicParam ? topicParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6) : [];
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  // Generic noise exclusion — source/config file extensions almost never
  // matter for a business-document search and otherwise crowd out the real
  // match purely by being recently touched. Not specific to any one file.
  const noiseExclusion = "not name contains '.json' and not name contains '.js' and not name contains '.ts'";
  const FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink)';

  // Builds an OR-group across topicTerms for the given Drive fields, e.g.
  // topicGroup(['name']) → "(name contains 'a' or name contains 'b')".
  // Returns null when there are no topic terms so callers can drop it from
  // the query entirely (old q-only behavior).
  function topicGroup(fields: ('name' | 'fullText')[]): string | null {
    if (topicTerms.length === 0) return null;
    const clauses = topicTerms.flatMap((t) => fields.map((f) => `${f} contains '${esc(t)}'`));
    return `(${clauses.join(' or ')})`;
  }

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
    // somewhere in file content, so this is checked first. When topic terms
    // are present (e.g. company + document-topic search), at least one of
    // them must ALSO appear in the name — company alone is never enough to
    // satisfy Tier 1 once a topic was given.
    if (words.length > 0) {
      const nameAndClause = words.map((w) => `name contains '${esc(w)}'`).join(' and ');
      const tier1Query = [nameAndClause, topicGroup(['name']), noiseExclusion, 'trashed = false'].filter(Boolean).join(' and ');
      const tier1 = await runQuery(tier1Query);
      if (!tier1.ok) return json({ ok: false, error: tier1.error }, 500);
      if (tier1.results.length > 0) return json({ ok: true, query: q, results: tier1.results });
    }

    // Tier 2 — broader OR across name/fullText for the q words, same noise
    // exclusion, only reached when Tier 1 found nothing. Topic terms (if
    // any) are still required here too — OR'd across name/fullText among
    // themselves, but AND'd against the q-words group — so a company name
    // match still can't satisfy the search on its own while a topic was
    // given; only Tier 3 below drops the topic requirement.
    const wordClauses = words.flatMap((w) => [`name contains '${esc(w)}'`, `fullText contains '${esc(w)}'`]);
    const wordsGroup = wordClauses.length > 0 ? `(${wordClauses.join(' or ')})` : null;
    const topicAnyGroup = topicGroup(['name', 'fullText']);
    const tier2Parts = [wordsGroup, topicAnyGroup, noiseExclusion, 'trashed = false'].filter(Boolean);
    if (wordsGroup || topicAnyGroup) {
      const tier2 = await runQuery(tier2Parts.join(' and '));
      if (!tier2.ok) return json({ ok: false, error: tier2.error }, 500);
      if (tier2.results.length > 0) return json({ ok: true, query: q, results: tier2.results });
    }

    // Tier 3 — last resort, only reached when a topic was given but not a
    // single file (by name or content) matched it: drop the topic
    // requirement and fall back to the old company/q-only behavior, so a
    // genuinely unmatched topic degrades to "show me Highway's files"
    // rather than an empty result. Never reached when no topic was given
    // (Tier 2 above already covers that case).
    if (topicTerms.length > 0 && wordsGroup) {
      const tier3 = await runQuery([wordsGroup, noiseExclusion, 'trashed = false'].join(' and '));
      if (!tier3.ok) return json({ ok: false, error: tier3.error }, 500);
      return json({ ok: true, query: q, results: tier3.results });
    }

    return json({ ok: true, query: q, results: [] });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
