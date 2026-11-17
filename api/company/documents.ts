// GET /api/company/documents?query=&type=&read=   (GIA P4, read-only)
// 公司文件 + 证照管理: every company document with its stored AI recognition
// (type, company, number, issue / expiry, authority, AI summary and extracted
// fields), licence status and version history, and — when asked — the full
// text of the original file.
//   • status / reminder rule = Home 证件到期提醒 (dailyWorkspaceStats
//     loadDocumentExpiryAlerts + documentExpiryRisk): reminder_enabled, expiry
//     within 90 days; expired ≤0 / urgent ≤7 / high ≤14 / reminder ≤30 /
//     early ≤60 / warning ≤90 days (UTC date, as Home)
//   • versions: same document type + company + document number, newest expiry
//     first; older versions are "superseded" (renewed)
//   • read=true (or a query matching ≤ 2 files): the original file is
//     downloaded as the caller and transcribed in full (max 2 files per call)
// Auth: requireModule(any GCI module) — the table and bucket are readable by
// every signed-in user (RLS). The account vault is never read.
import { requireModule } from '../_lib/auth';
import { json, userRows, downloadAsUser, readFileText, maskCredentials, norm, clip } from './_read';

export const config = { runtime: 'edge' };

export const READ_MAX_FILES = 2;

interface Doc {
  id: string; category?: string; document_name?: string; file_name?: string; storage_path?: string;
  file_size?: number | null; mime_type?: string | null; expiry_date?: string | null; notes?: string;
  uploaded_at?: string; updated_at?: string; document_type?: string | null; company_name?: string | null;
  document_number?: string | null; issue_date?: string | null; issuing_authority?: string | null;
  ai_summary?: string | null; ai_extracted?: Record<string, unknown> | null; ai_status?: string | null;
  ai_confidence?: number | null; reminder_enabled?: boolean;
}

const RISK_ZH: Record<string, string> = {
  expired: '已过期', urgent: '7 天内到期', high: '14 天内到期', reminder: '30 天内到期', early: '60 天内到期', warning: '90 天内到期', ok: '有效',
};

export function expiryRisk(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return 'expired';
  if (days <= 7) return 'urgent';
  if (days <= 14) return 'high';
  if (days <= 30) return 'reminder';
  if (days <= 60) return 'early';
  if (days <= 90) return 'warning';
  return 'ok';
}

export function daysUntil(date: string | null | undefined, today: string): number | null {
  if (!date) return null;
  const d = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  return Number.isNaN(d) ? null : Math.round((d - t) / 86400000);
}

const typeOf = (d: Doc) => d.document_type || d.category || '其他';
const groupKey = (d: Doc) => [norm(typeOf(d)), norm(d.company_name), norm(d.document_number) || `id:${d.id}`].join('|');

export function buildDocuments(docs: Doc[], today: string, opts: { query?: string; type?: string } = {}) {
  // Version history per (type, company, number)
  const groups = new Map<string, Doc[]>();
  for (const d of docs) {
    const k = groupKey(d);
    groups.set(k, [...(groups.get(k) || []), d]);
  }
  const versionInfo = new Map<string, { version: number; versions: number; supersededBy: string | null; isCurrent: boolean }>();
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) =>
      String(b.expiry_date || '').localeCompare(String(a.expiry_date || '')) || String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
    const latestExpiry = sorted[0]?.expiry_date || null;
    sorted.forEach((d, i) => {
      const superseded = !!latestExpiry && !!d.expiry_date && d.expiry_date < latestExpiry;
      versionInfo.set(d.id, {
        version: sorted.length - i, versions: sorted.length,
        supersededBy: superseded ? latestExpiry : null,
        isCurrent: !superseded,
      });
    });
  }

  const shape = (d: Doc) => {
    const days = daysUntil(d.expiry_date, today);
    const risk = expiryRisk(days);
    const v = versionInfo.get(d.id)!;
    return {
      id: d.id,
      name: d.document_name || d.file_name || '—',
      fileName: d.file_name || null,
      category: d.category || null,
      documentType: typeOf(d),
      companyName: d.company_name || null,
      documentNumber: d.document_number || null,
      issuingAuthority: d.issuing_authority || null,
      issueDate: d.issue_date || null,
      expiryDate: d.expiry_date || null,
      daysUntilExpiry: days,
      status: v.isCurrent ? (risk ? RISK_ZH[risk] : '无到期日') : `旧版本（已续期，新版本到期 ${v.supersededBy}）`,
      reminderEnabled: !!d.reminder_enabled,
      inHomeReminder: !!d.reminder_enabled && days !== null && days <= 90,
      version: `${v.version}/${v.versions}`,
      isCurrentVersion: v.isCurrent,
      aiStatus: d.ai_status || null,
      aiConfidence: d.ai_confidence ?? null,
      aiSummary: d.ai_summary ? maskCredentials(d.ai_summary) : null,
      aiExtracted: d.ai_extracted ? JSON.parse(maskCredentials(JSON.stringify(d.ai_extracted))) : null,
      notes: d.notes ? maskCredentials(clip(d.notes, 500)) : null,
      uploadedAt: d.uploaded_at?.slice(0, 10) || null,
    };
  };

  const q = norm(opts.query);
  const t = norm(opts.type);
  const hay = (d: Doc) => norm([d.document_name, d.file_name, d.category, d.document_type, d.company_name, d.document_number,
    d.issuing_authority, d.ai_summary, d.notes, d.ai_extracted ? JSON.stringify(d.ai_extracted) : ''].join(' '));
  const matched = docs
    .filter((d) => (!q || hay(d).includes(q)) && (!t || norm(typeOf(d)).includes(t) || norm(d.category).includes(t)))
    .sort((a, b) => String(a.expiry_date || '9999').localeCompare(String(b.expiry_date || '9999')));

  const all = docs.map(shape);
  const alerts = all.filter((d) => d.inHomeReminder).sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));
  return {
    today,
    totalDocuments: docs.length,
    byType: all.reduce((m: Record<string, number>, d) => ((m[d.documentType] = (m[d.documentType] || 0) + 1), m), {}),
    licences: {
      expired: all.filter((d) => d.isCurrentVersion && d.daysUntilExpiry !== null && d.daysUntilExpiry <= 0).map((d) => d.name),
      expiringIn90Days: all.filter((d) => d.isCurrentVersion && d.daysUntilExpiry !== null && d.daysUntilExpiry > 0 && d.daysUntilExpiry <= 90).map((d) => `${d.name}（${d.expiryDate}）`),
      renewedOldVersionsStillReminding: all.filter((d) => !d.isCurrentVersion && d.inHomeReminder).map((d) => `${d.name} · ${d.fileName}（${d.expiryDate}）`),
    },
    homeReminders: { count: alerts.length, items: alerts.map((d) => ({ name: d.name, fileName: d.fileName, expiryDate: d.expiryDate, daysUntilExpiry: d.daysUntilExpiry, status: d.status })) },
    filters: { query: opts.query || null, type: opts.type || null },
    matchedCount: matched.length,
    documents: matched.slice(0, 30).map(shape),
    _matchedRaw: matched,
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['crm', 'trade', 'quotation', 'finance', 'warehouse', 'knowledge_public', 'knowledge', 'knowledge_confidential']);
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams;
  const query = p.get('query')?.trim() || '';
  const type = p.get('type')?.trim() || '';
  const readFlag = /^(1|true|yes)$/i.test(p.get('read') || '');
  try {
    const docs = await userRows<Doc>(auth.ctx, 'company_documents', 'select=*&order=uploaded_at.desc&limit=500');
    const { _matchedRaw, ...view } = buildDocuments(docs, new Date().toISOString().slice(0, 10), { query, type });

    // Original-file content: on request, or automatically when a search narrows to ≤ 2 files.
    const wantRead = readFlag || ((!!query || !!type) && _matchedRaw.length > 0 && _matchedRaw.length <= READ_MAX_FILES);
    let contents: Array<{ id: string; name: string; fileName: string | null; text?: string; error?: string }> | undefined;
    let readNote: string | undefined;
    if (wantRead) {
      const targets = _matchedRaw.filter((d) => d.storage_path).slice(0, READ_MAX_FILES);
      if (_matchedRaw.length > READ_MAX_FILES) readNote = `匹配 ${_matchedRaw.length} 份文件，只读取了前 ${READ_MAX_FILES} 份的原文；请指定文件名或证号读取其他文件`;
      contents = await Promise.all(targets.map(async (d) => {
        const head = { id: d.id, name: d.document_name || d.file_name || '—', fileName: d.file_name || null };
        try {
          const file = await downloadAsUser(auth.ctx, 'company-documents', d.storage_path!);
          return { ...head, text: await readFileText(request, { bytes: file.bytes, mime: d.mime_type || file.mime }) };
        } catch (e) {
          return { ...head, error: e instanceof Error ? e.message : 'read_failed' };
        }
      }));
    }
    return json({
      ok: true,
      source: 'company_documents + company-documents 存储原件（公司文件）',
      ...view,
      originalContents: contents,
      readNote,
      note: '原件内容为读取时识别的全文，未保存；认证凭证类信息已隐藏',
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
