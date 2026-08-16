// GCI Executive Desk — Task 10: /commitments — Commitment Tracker history +
// candidate review. Every write here only touches executive_commitments —
// no external action of any kind (no CRM/Decision/Gmail/Calendar writes).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  refreshCommitments,
  getCommitments,
  getCrmCommitmentCandidates,
  getGmailCommitmentCandidates,
  confirmCommitmentCandidate,
  updateCommitmentStatus,
  commitmentDisplayStatus,
  COMMITMENT_SOURCE_LABEL,
  COMMITMENT_TYPE_LABEL,
  type ExecutiveCommitment,
  type CommitmentCandidate,
  type CommitmentSource,
  type CommitmentType,
} from '../lib/commitments';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type Filter = 'all' | 'open' | 'overdue' | 'completed' | CommitmentType | CommitmentSource;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'outbound', label: 'Outbound' },
  { key: 'inbound', label: 'Inbound' },
  { key: 'internal', label: 'Internal' },
  { key: 'crm', label: 'CRM' },
  { key: 'gmail', label: 'Gmail' },
  { key: 'decision', label: 'Decision' },
];

const STATUS_COLOR: Record<string, string> = { open: AMBER, overdue: RED, completed: GREEN, cancelled: MUTED };
const STATUS_LABEL: Record<string, string> = { open: 'Open', overdue: 'Overdue', completed: 'Completed', cancelled: 'Cancelled' };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  const hh = String(dubai.getUTCHours()).padStart(2, '0');
  const mm = String(dubai.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mm}`;
}

export function Commitments() {
  const navigate = useNavigate();
  const [commitments, setCommitments] = useState<ExecutiveCommitment[] | null>(null);
  const [candidates, setCandidates] = useState<CommitmentCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadAll() {
    refreshCommitments().then((res) => {
      if (res.ok) setCommitments(res.rows);
      else setError(res.error);
    });
    Promise.all([getCrmCommitmentCandidates(), getGmailCommitmentCandidates()]).then(([crmRes, gmailRes]) => {
      const list: CommitmentCandidate[] = [];
      if (crmRes.ok) list.push(...crmRes.candidates);
      if (gmailRes.ok) list.push(...gmailRes.candidates);
      setCandidates(list);
    });
  }

  useEffect(() => { loadAll(); }, []);

  async function handleConfirmCandidate(c: CommitmentCandidate) {
    setBusyId(c.id);
    const res = await confirmCommitmentCandidate(c);
    setBusyId(null);
    if (res.ok) {
      setCandidates((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      getCommitments().then((r) => { if (r.ok) setCommitments(r.rows); });
    }
  }

  function handleDismissCandidate(id: string) {
    // Ephemeral only — never persisted, so dismissing just removes it from
    // this render; it may resurface on the next scan (by design, per §3.B).
    setCandidates((prev) => (prev ?? []).filter((x) => x.id !== id));
  }

  async function handleStatusChange(id: string, status: 'completed' | 'cancelled') {
    setBusyId(id);
    await updateCommitmentStatus(id, status);
    setBusyId(null);
    getCommitments().then((r) => { if (r.ok) setCommitments(r.rows); });
  }

  const nowMs = Date.now();
  const filtered = useMemo(() => {
    if (!commitments) return [];
    if (filter === 'all') return commitments;
    if (filter === 'open') return commitments.filter((c) => commitmentDisplayStatus(c, nowMs) === 'open');
    if (filter === 'overdue') return commitments.filter((c) => commitmentDisplayStatus(c, nowMs) === 'overdue');
    if (filter === 'completed') return commitments.filter((c) => c.status === 'completed');
    if (filter === 'outbound' || filter === 'inbound' || filter === 'internal') return commitments.filter((c) => c.commitment_type === filter);
    return commitments.filter((c) => c.source === filter);
  }, [commitments, filter, nowMs]);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 32px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          Commitments / 承诺事项
        </h1>
      </div>

      {candidates && candidates.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 10, letterSpacing: '0.05em' }}>
            待确认候选 · {candidates.length} 条(仅规则识别,需人工确认后才会保存)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {candidates.map((c) => (
              <div key={c.id} style={{ padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 12, opacity: busyId === c.id ? 0.5 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                    {COMMITMENT_SOURCE_LABEL[c.source]}
                  </span>
                  <span style={{ fontSize: 9.5, color: MUTED, background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 7px' }}>
                    {COMMITMENT_TYPE_LABEL[c.commitment_type]}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{c.title}</span>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  {c.commitment_text}
                  {c.due_at ? ` · 截止 ${formatDate(c.due_at)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleConfirmCandidate(c)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: '1px solid rgba(203,168,92,0.4)', color: GOLD }}
                  >
                    确认保存
                  </button>
                  <button
                    onClick={() => handleDismissCandidate(c.id)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    忽略
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              background: filter === f.key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filter === f.key ? 'rgba(203,168,92,0.5)' : BORD}`,
              color: filter === f.key ? GOLD : MUTED,
              fontWeight: filter === f.key ? 700 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.08)', border: `1px solid ${RED}40`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>
          读取失败:{error}
        </div>
      )}
      {!commitments && !error && <div style={{ color: MUTED, fontSize: 13 }}>加载中…</div>}
      {commitments && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>没有符合条件的事项</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((c) => {
          const displayStatus = commitmentDisplayStatus(c, nowMs);
          const sColor = STATUS_COLOR[displayStatus] ?? MUTED;
          return (
            <div key={c.id} style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, opacity: busyId === c.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {STATUS_LABEL[displayStatus]}
                </span>
                <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                  {COMMITMENT_SOURCE_LABEL[c.source]}
                </span>
                <span style={{ fontSize: 9.5, color: MUTED, background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 7px' }}>
                  {COMMITMENT_TYPE_LABEL[c.commitment_type]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{c.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace' }}>{formatDate(c.due_at)}</span>
              </div>

              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>{c.commitment_text}</div>
              {c.counterparty && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>对象:{c.counterparty}</div>}
              {c.source_link && (
                <a href={c.source_link} target={c.source_link.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ fontSize: 11, color: GOLD, textDecoration: 'none' }}>
                  查看原始来源 →
                </a>
              )}

              {c.status === 'open' ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => handleStatusChange(c.id, 'completed')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.12)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>
                    标记完成
                  </button>
                  <button onClick={() => handleStatusChange(c.id, 'cancelled')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                    取消
                  </button>
                </div>
              ) : c.status === 'completed' ? (
                <div style={{ fontSize: 11.5, color: GREEN, marginTop: 6 }}>已完成 · {formatDate(c.completed_at)}</div>
              ) : (
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>已取消</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
