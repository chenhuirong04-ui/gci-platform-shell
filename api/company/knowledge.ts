// GET /api/company/knowledge?query=&kind=&id=   (GIA P4, read-only)
// 知识库 (Knowledge & Rules): search with the module's own knowledge_search()
// (rules / items / business activities, ranked — the same function the
// Knowledge page uses), then return the FULL record of each hit: item body,
// every rule field (applies to, conditions, required actions & documents,
// deadline, risks, exceptions, official contacts), every activity field.
// Sources (资料来源) and open questions are matched by text as well.
// kind: rule | item | activity | source | question (optional filter);
// id + kind: one complete record.
// Confidentiality stays with RLS (knowledge_can_read: PUBLIC / INTERNAL /
// CONFIDENTIAL by module, Admins all) — everything is read as the caller.
import { requireModule } from '../_lib/auth';
import { json, userRows, userRpc, maskCredentials, clip } from './_read';

export const config = { runtime: 'edge' };

export const FULL_MAX = 8;
const BODY_MAX = 6000;

const TABLE: Record<string, { table: string; select: string }> = {
  rule: { table: 'knowledge_rules', select: 'id,title,applies_to,trigger_conditions,required_actions,required_documents,deadline,risks,exceptions,source_note,country,region,industry,official_service_url,official_email,official_phone,official_address,official_working_hours,contact_last_verified_date,status,confidentiality,verification_status,knowledge_item_id' },
  item: { table: 'knowledge_items', select: 'id,title,summary,body,country,region,emirate,activity_code,source_page,language,status,confidentiality,verification_status,published_at,effective_date,expiry_date,last_verified_at,source_id' },
  activity: { table: 'knowledge_activities', select: 'id,business_sector,sub_sector,activity_code,activity_name,activity_name_arabic,licence_type,activity_description,space_required,restrictions,additional_requirements,third_party_approval_required,source_file,confidentiality,verification_status' },
  source: { table: 'knowledge_sources', select: 'id,title,file_name,drive_url,source_institution,document_type,version,status,confidentiality,verification_status,published_at' },
  question: { table: 'knowledge_questions', select: 'id,question,context,target_authority,status,review_note,confidentiality' },
};
const KIND_ZH: Record<string, string> = { rule: '规则', item: '资料', activity: '经营活动', source: '资料来源', question: '待确认问题' };

const ilikeVal = (q: string) => `*${q.replace(/[*,()]/g, ' ').trim()}*`;

/** Trim long text fields and mask credential-like values; keep everything else as stored. */
export function fullRecord(kind: string, row: Record<string, unknown>) {
  const out: Record<string, unknown> = { kind, kindZh: KIND_ZH[kind] || kind };
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === '' || v === undefined) continue;
    out[k] = typeof v === 'string' ? maskCredentials(clip(v, BODY_MAX)) : v;
  }
  return out;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['crm', 'trade', 'quotation', 'finance', 'warehouse', 'knowledge_public', 'knowledge', 'knowledge_confidential']);
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams;
  const query = p.get('query')?.trim() || '';
  const kind = (p.get('kind')?.trim() || '').toLowerCase();
  const id = p.get('id')?.trim() || '';
  if (kind && !TABLE[kind]) return json({ ok: false, error: 'kind must be rule | item | activity | source | question' }, 400);
  try {
    // One complete record
    if (id) {
      if (!kind) return json({ ok: false, error: 'id needs kind' }, 400);
      const t = TABLE[kind];
      const rows = await userRows<Record<string, unknown>>(auth.ctx, t.table, `select=${t.select}&id=eq.${encodeURIComponent(id)}`);
      return json({ ok: true, source: `${t.table}（知识库）`, records: rows.map((r) => fullRecord(kind, r)), matchedCount: rows.length });
    }
    if (!query) return json({ ok: false, error: 'query is required (or id + kind)' }, 400);

    // Ranked search (rules / items / activities) — the Knowledge module's own function
    const hits = (!kind || ['rule', 'item', 'activity'].includes(kind))
      ? (await userRpc<{ kind: string; id: string; title: string; rank: number }>(auth.ctx, 'knowledge_search', { q: query, max_results: 30 }))
        .filter((h) => !kind || h.kind === kind)
      : [];
    // Sources and questions by text
    const v = encodeURIComponent(ilikeVal(query));
    const [sources, questions] = await Promise.all([
      (!kind || kind === 'source')
        ? userRows<Record<string, unknown>>(auth.ctx, 'knowledge_sources', `select=${TABLE.source.select}&or=(title.ilike.${v},source_institution.ilike.${v},document_type.ilike.${v},file_name.ilike.${v})&limit=10`)
        : Promise.resolve([]),
      (!kind || kind === 'question')
        ? userRows<Record<string, unknown>>(auth.ctx, 'knowledge_questions', `select=${TABLE.question.select}&or=(question.ilike.${v},context.ilike.${v})&limit=10`)
        : Promise.resolve([]),
    ]);

    // Full content of the top hits, in rank order
    const top = hits.slice(0, FULL_MAX);
    const byKind = new Map<string, string[]>();
    for (const h of top) byKind.set(h.kind, [...(byKind.get(h.kind) || []), h.id]);
    const fullById = new Map<string, Record<string, unknown>>();
    await Promise.all(Array.from(byKind.entries()).map(async ([k, ids]) => {
      const t = TABLE[k];
      if (!t) return;
      const rows = await userRows<Record<string, unknown>>(auth.ctx, t.table, `select=${t.select}&id=in.(${ids.join(',')})`);
      for (const r of rows) fullById.set(String(r.id), fullRecord(k, r));
    }));

    return json({
      ok: true,
      source: 'knowledge_search() + knowledge_rules / items / activities / sources / questions（知识库）',
      filters: { query, kind: kind || null },
      matchedCount: hits.length + sources.length + questions.length,
      results: top.map((h) => fullById.get(h.id) || { kind: h.kind, kindZh: KIND_ZH[h.kind], id: h.id, title: h.title }),
      moreResults: hits.slice(FULL_MAX).map((h) => ({ kind: h.kind, kindZh: KIND_ZH[h.kind] || h.kind, id: h.id, title: h.title })),
      sources: sources.map((r) => fullRecord('source', r)),
      questions: questions.map((r) => fullRecord('question', r)),
      note: '资料来源（knowledge_sources）只有登记信息，没有上传原文件；资料与规则的正文即知识库中的原始内容',
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
