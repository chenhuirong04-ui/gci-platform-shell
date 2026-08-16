// GCI Executive Desk — Task 8: /decisions — Decision Inbox history + pending.
// Read/record only. Selecting an option here only writes to
// executive_decisions — no external action of any kind.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  refreshPendingDecisions,
  getDecisions,
  recordDecision,
  DECISION_SOURCE_LABEL,
  type ExecutiveDecision,
  type DecisionSource,
} from '../lib/decisionInbox';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<string, string> = { P1: RED, P2: AMBER, P3: MUTED };

type Filter = 'all' | 'pending' | 'decided' | 'dismissed' | DecisionSource;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: 'Pending' },
  { key: 'decided', label: 'Decided' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'crm', label: 'CRM' },
  { key: 'business', label: 'Business' },
  { key: 'systems', label: 'Systems' },
  { key: 'email', label: 'Email' },
  { key: 'agents', label: 'Agents' },
];

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

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', decided: 'Decided', dismissed: 'Dismissed' };
const STATUS_COLOR: Record<string, string> = { pending: AMBER, decided: GREEN, dismissed: MUTED };

export function Decisions() {
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<ExecutiveDecision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadAll() {
    // Sync candidates once (idempotent), then load the full history.
    refreshPendingDecisions().then((syncRes) => {
      if (!syncRes.ok) { setError(syncRes.error); return; }
      getDecisions().then((res) => {
        if (res.ok) setDecisions(res.rows);
        else setError(res.error);
      });
    });
  }

  useEffect(() => { loadAll(); }, []);

  async function handleDecide(id: string, optionKey: string) {
    setBusyId(id);
    await recordDecision(id, optionKey);
    setBusyId(null);
    getDecisions().then((res) => { if (res.ok) setDecisions(res.rows); });
  }

  const filtered = useMemo(() => {
    if (!decisions) return [];
    if (filter === 'all') return decisions;
    if (filter === 'pending' || filter === 'decided' || filter === 'dismissed') {
      return decisions.filter((d) => d.status === filter);
    }
    return decisions.filter((d) => d.source === filter);
  }, [decisions, filter]);

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
          Decision Inbox / 老板审批箱
        </h1>
      </div>

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
      {!decisions && !error && <div style={{ color: MUTED, fontSize: 13 }}>加载中…</div>}
      {decisions && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>没有符合条件的事项</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((d) => {
          const pColor = PRIORITY_COLOR[d.priority] ?? MUTED;
          const sColor = STATUS_COLOR[d.status] ?? MUTED;
          return (
            <div key={d.id} style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, opacity: busyId === d.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: pColor, background: `${pColor}18`, border: `1px solid ${pColor}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {d.priority}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {STATUS_LABEL[d.status]}
                </span>
                <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                  {DECISION_SOURCE_LABEL[d.source]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{d.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace' }}>{formatDate(d.created_at)}</span>
              </div>

              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 6 }}>
                <span style={{ color: GOLD, fontWeight: 700 }}>Reason: </span>{d.reason}
              </div>
              {d.summary && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 6 }}>{d.summary}</div>}

              {d.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {d.decision_options.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleDecide(d.id, opt.key)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer',
                        background: opt.key === 'later' ? 'rgba(255,255,255,0.04)' : 'rgba(203,168,92,0.12)',
                        border: `1px solid ${opt.key === 'later' ? BORD : 'rgba(203,168,92,0.4)'}`,
                        color: opt.key === 'later' ? MUTED : GOLD,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: GREEN, marginTop: 4 }}>
                  已选择:{d.decision_options.find((o) => o.key === d.selected_option)?.label ?? d.selected_option} · {formatDate(d.decided_at)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
