// Enterprise Services -> Knowledge & Rules (知识与规则).
// Data: the knowledge_* tables migrated from the standalone Knowledge Hub. What each user sees is decided
// entirely by RLS (knowledge_can_read); this page only renders what the database returns.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import {
  searchKnowledge, listActivities, listRules, listItems, listSources, listQuestions, updateQuestionStatus,
  type KnowledgeHit, type KnowledgeActivity, type KnowledgeRule, type KnowledgeItem, type KnowledgeSource,
  type KnowledgeQuestion, type QuestionStatus,
} from '../lib/knowledge';
import { VerificationBadge, LevelBadge, DraftBadge } from '../components/KnowledgeBadges';

const GOLD = '#CBA85C';
const MUTED = '#7A8494';
const RED = '#E0846A';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type Tab = 'search' | 'activities' | 'rules' | 'items' | 'sources' | 'questions';
const TABS: { key: Tab; zh: string; en: string }[] = [
  { key: 'search',     zh: '知识搜索', en: 'Knowledge Search' },
  { key: 'activities', zh: '经营活动', en: 'Business Activities' },
  { key: 'rules',      zh: '规则库',   en: 'Rules' },
  { key: 'items',      zh: '知识点',   en: 'Knowledge Items' },
  { key: 'sources',    zh: '来源',     en: 'Sources' },
  { key: 'questions',  zh: '待确认问题', en: 'Pending Questions' },
];
const KIND_LABEL: Record<string, { zh: string; en: string }> = {
  rule: { zh: '规则', en: 'Rule' }, item: { zh: '知识点', en: 'Knowledge Item' }, activity: { zh: '经营活动', en: 'Activity' },
};

const inputSt: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${BORD}`, color: colors.textPrimary, minWidth: 280,
};
const cardSt: React.CSSProperties = { background: CARD, border: `1px solid ${BORD}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 };

function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    load().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(String(e?.message ?? e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, setData };
}

function Status({ loading, error, empty, zh }: { loading: boolean; error: string; empty: boolean; zh: boolean }) {
  if (loading) return <div style={{ color: MUTED, fontSize: 13, padding: '12px 0' }}>{zh ? '加载中…' : 'Loading…'}</div>;
  if (error) return <div style={{ color: RED, fontSize: 13, padding: '12px 0' }}>{zh ? '读取失败：' : 'Failed to load: '}{error}</div>;
  if (empty) return <div style={{ color: MUTED, fontSize: 13, padding: '12px 0' }}>{zh ? '没有可显示的条目（或你的权限级别看不到）。' : 'Nothing to show (or not visible at your access level).'}</div>;
  return null;
}

function Badges({ level, verification, status, lang }: { level?: string; verification?: string | null; status?: string | null; lang: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <VerificationBadge value={verification} lang={lang} />
      <DraftBadge status={status} lang={lang} />
      <LevelBadge value={level} lang={lang} />
    </span>
  );
}

function PendingNote({ verification, zh }: { verification?: string | null; zh: boolean }) {
  if (verification !== 'PENDING') return null;
  return <div style={{ color: '#D4A843', fontSize: 12, marginTop: 4 }}>{zh ? '该条目尚未完成复核。' : 'This entry has not been reviewed yet.'}</div>;
}

// ── Knowledge Search ──
function SearchTab({ zh, lang, initial }: { zh: boolean; lang: string; initial: string }) {
  const [input, setInput] = useState(initial);
  const [q, setQ] = useState(initial);
  const { data, error, loading } = useLoader<KnowledgeHit[]>(() => (q ? searchKnowledge(q) : Promise.resolve([])), [q]);
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setQ(input.trim()); }} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} style={inputSt}
          placeholder={zh ? '例如：Golden Visa、增值税、经营活动代码' : 'e.g. Golden Visa, VAT, activity code'} />
        <button type="submit" style={{ ...inputSt, minWidth: 0, cursor: 'pointer', color: GOLD }}>{zh ? '搜索' : 'Search'}</button>
      </form>
      {q && <Status loading={loading} error={error} empty={!!data && data.length === 0} zh={zh} />}
      {(data ?? []).map((h) => (
        <div key={`${h.kind}-${h.id}`} style={cardSt}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>{zh ? KIND_LABEL[h.kind].zh : KIND_LABEL[h.kind].en}</span>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{h.title}</span>
            <Badges level={h.confidentiality} verification={h.verification_status} status={h.status} lang={lang} />
          </div>
          {h.snippet && <div style={{ color: colors.textSecondary, fontSize: 13 }}>{h.snippet}</div>}
          <PendingNote verification={h.verification_status} zh={zh} />
        </div>
      ))}
    </div>
  );
}

// ── Business Activities ──
function ActivitiesTab({ zh, lang }: { zh: boolean; lang: string }) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const { data, error, loading } = useLoader(() => listActivities(q), [q]);
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setQ(input.trim()); }} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} style={inputSt}
          placeholder={zh ? '按活动代码 / 名称 / 行业搜索' : 'Search by code / name / sector'} />
        <button type="submit" style={{ ...inputSt, minWidth: 0, cursor: 'pointer', color: GOLD }}>{zh ? '搜索' : 'Search'}</button>
      </form>
      {data && <div style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>
        {zh ? `共 ${data.total} 条，显示前 ${data.rows.length} 条` : `${data.total} total, showing ${data.rows.length}`}
      </div>}
      <Status loading={loading} error={error} empty={!!data && data.rows.length === 0} zh={zh} />
      {(data?.rows ?? []).map((a: KnowledgeActivity) => (
        <div key={a.id} style={cardSt}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            {a.activity_code
              ? <span style={{ fontFamily: 'monospace', color: GOLD, fontSize: 12 }}>{a.activity_code}</span>
              : <span style={{ color: MUTED, fontSize: 12 }}>{zh ? '（无代码）' : '(no code)'}</span>}
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{a.activity_name}</span>
            <Badges level={a.confidentiality} verification={a.verification_status} lang={lang} />
          </div>
          <div style={{ color: colors.textSecondary, fontSize: 12 }}>
            {[a.jurisdiction?.name, a.business_sector, a.sub_sector, a.licence_type].filter(Boolean).join(' · ')}
          </div>
          {a.activity_description && <div style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>{a.activity_description}</div>}
          {a.restrictions && <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{zh ? '限制：' : 'Restrictions: '}{a.restrictions}</div>}
          {a.third_party_approval_required && <div style={{ color: MUTED, fontSize: 12 }}>{zh ? '第三方审批：' : 'Third-party approval: '}{a.third_party_approval_required}</div>}
          <PendingNote verification={a.verification_status} zh={zh} />
        </div>
      ))}
    </div>
  );
}

// ── Rules / Knowledge Items (simple filtered lists) ──
function RulesTab({ zh, lang }: { zh: boolean; lang: string }) {
  const [q, setQ] = useState('');
  const { data, error, loading } = useLoader(() => listRules(q), [q]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputSt, marginBottom: 12 }} placeholder={zh ? '筛选规则' : 'Filter rules'} />
      <Status loading={loading} error={error} empty={!!data && data.length === 0} zh={zh} />
      {(data ?? []).map((r: KnowledgeRule) => (
        <div key={r.id} style={cardSt}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{r.title}</span>
            <Badges level={r.confidentiality} verification={r.verification_status} status={r.status} lang={lang} />
          </div>
          {r.applies_to && <div style={{ color: colors.textSecondary, fontSize: 13 }}><b>{zh ? '适用：' : 'Applies to: '}</b>{r.applies_to}</div>}
          {r.required_actions && <div style={{ color: colors.textSecondary, fontSize: 13, whiteSpace: 'pre-wrap' }}><b>{zh ? '要求：' : 'Required actions: '}</b>{r.required_actions}</div>}
          {r.required_documents && <div style={{ color: MUTED, fontSize: 12 }}>{zh ? '所需文件：' : 'Documents: '}{r.required_documents}</div>}
          <PendingNote verification={r.verification_status} zh={zh} />
        </div>
      ))}
    </div>
  );
}

function ItemsTab({ zh, lang }: { zh: boolean; lang: string }) {
  const [q, setQ] = useState('');
  const { data, error, loading } = useLoader(() => listItems(q), [q]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputSt, marginBottom: 12 }} placeholder={zh ? '筛选知识点' : 'Filter items'} />
      <Status loading={loading} error={error} empty={!!data && data.length === 0} zh={zh} />
      {(data ?? []).map((i: KnowledgeItem) => (
        <div key={i.id} style={cardSt}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{i.title}</span>
            {i.activity_code && <span style={{ fontFamily: 'monospace', color: GOLD, fontSize: 12 }}>{i.activity_code}</span>}
            <Badges level={i.confidentiality} verification={i.verification_status} status={i.status} lang={lang} />
          </div>
          {i.summary && <div style={{ color: colors.textSecondary, fontSize: 13 }}>{i.summary}</div>}
          <PendingNote verification={i.verification_status} zh={zh} />
        </div>
      ))}
    </div>
  );
}

// ── Sources (metadata only; no empty links) ──
function SourcesTab({ zh, lang }: { zh: boolean; lang: string }) {
  const { data, error, loading } = useLoader<KnowledgeSource[]>(() => listSources(), []);
  return (
    <div>
      <Status loading={loading} error={error} empty={!!data && data.length === 0} zh={zh} />
      {(data ?? []).map((s) => (
        <div key={s.id} style={cardSt}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{s.title}</span>
            <Badges level={s.confidentiality} verification={s.verification_status} status={s.status} lang={lang} />
          </div>
          <div style={{ color: colors.textSecondary, fontSize: 12 }}>
            {[s.source_institution, s.document_type, s.version && `v${s.version}`, s.file_name].filter(Boolean).join(' · ')}
          </div>
          {s.drive_url && s.drive_url.trim() && (
            <a href={s.drive_url} target="_blank" rel="noreferrer" style={{ color: GOLD, fontSize: 12 }}>{zh ? '打开原文件' : 'Open source file'}</a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Pending Questions (status change goes through RLS; no owner assignment) ──
function QuestionsTab({ zh, lang }: { zh: boolean; lang: string }) {
  const [filter, setFilter] = useState<QuestionStatus | 'ALL'>('OPEN');
  const { data, error, loading, setData } = useLoader<KnowledgeQuestion[]>(() => listQuestions(filter), [filter]);
  const [msg, setMsg] = useState('');
  async function change(q: KnowledgeQuestion, status: QuestionStatus) {
    setMsg('');
    try {
      const ok = await updateQuestionStatus(q.id, status);
      if (!ok) { setMsg(zh ? '你的权限不能修改该问题的状态。' : 'Your access level cannot change this question.'); return; }
      setData((prev) => (prev ?? []).map((x) => (x.id === q.id ? { ...x, status } : x)).filter((x) => filter === 'ALL' || x.status === filter));
    } catch (e: any) { setMsg(String(e?.message ?? e)); }
  }
  const label = (s: QuestionStatus) => (zh ? { OPEN: '待确认', RESOLVED: '已解决', STALE: '已过时' } : { OPEN: 'Open', RESOLVED: 'Resolved', STALE: 'Stale' })[s];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {(['OPEN', 'RESOLVED', 'STALE', 'ALL'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ ...inputSt, minWidth: 0, cursor: 'pointer', color: filter === s ? GOLD : colors.textSecondary, borderColor: filter === s ? GOLD : BORD }}>
            {s === 'ALL' ? (zh ? '全部' : 'All') : label(s)}
          </button>
        ))}
        {data && <span style={{ color: MUTED, fontSize: 12 }}>{zh ? `${data.length} 条` : `${data.length} question(s)`}</span>}
      </div>
      {msg && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{msg}</div>}
      <Status loading={loading} error={error} empty={!!data && data.length === 0} zh={zh} />
      {(data ?? []).map((q) => (
        <div key={q.id} style={cardSt}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{q.question}</span>
            <Badges level={q.confidentiality} verification={q.verification_status} lang={lang} />
          </div>
          {q.context && <div style={{ color: colors.textSecondary, fontSize: 13 }}>{q.context}</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            {q.target_authority && <span style={{ color: MUTED, fontSize: 12 }}>{zh ? '确认对象：' : 'Ask: '}{q.target_authority}</span>}
            {q.review_note && <span style={{ color: '#D4A843', fontSize: 12 }}>{q.review_note}</span>}
            <select value={q.status} onChange={(e) => change(q, e.target.value as QuestionStatus)}
              style={{ ...inputSt, minWidth: 0, padding: '4px 8px', marginLeft: 'auto', colorScheme: 'dark' }}>
              {(['OPEN', 'RESOLVED', 'STALE'] as const).map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function KnowledgePage() {
  const { lang } = useI18n();
  const zh = lang !== 'en';
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'search') as Tab;
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); if (t !== 'search') n.delete('q'); return n; });
  const title = useMemo(() => (zh ? '知识与规则' : 'Knowledge & Rules'), [zh]);

  return (
    <div style={{ padding: '24px 28px', color: colors.textPrimary }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', color: GOLD, fontFamily: 'monospace', marginBottom: 4 }}>
        {zh ? '企业服务 · ENTERPRISE SERVICES' : 'ENTERPRISE SERVICES'}
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 4px' }}>{title}</h1>
      <div style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>
        {zh ? 'UAE 企业设立、执照、经营活动、税务、海关、签证等规则与知识。条目状态以标签为准，草稿与待复核内容不构成官方最终结论。'
            : 'Rules and knowledge on UAE company setup, licences, activities, tax, customs and visas. Drafts and pending-review entries are not final official conclusions.'}
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORD}`, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
            color: tab === t.key ? GOLD : colors.textSecondary, borderBottom: `2px solid ${tab === t.key ? GOLD : 'transparent'}`,
          }}>{zh ? t.zh : t.en}</button>
        ))}
      </div>
      {tab === 'search' && <SearchTab zh={zh} lang={lang} initial={initialQ} />}
      {tab === 'activities' && <ActivitiesTab zh={zh} lang={lang} />}
      {tab === 'rules' && <RulesTab zh={zh} lang={lang} />}
      {tab === 'items' && <ItemsTab zh={zh} lang={lang} />}
      {tab === 'sources' && <SourcesTab zh={zh} lang={lang} />}
      {tab === 'questions' && <QuestionsTab zh={zh} lang={lang} />}
    </div>
  );
}
