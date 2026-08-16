// GCI Executive Desk — Task 7: /actions — full Boss Action Center list.
// Read-only. Filtering only this round, no search.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getBossActions,
  SOURCE_LABEL,
  type BossAction,
  type ActionPriority,
  type ActionSource,
} from '../lib/actionCenter';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<ActionPriority, string> = { P1: RED, P2: AMBER, P3: MUTED };

type Filter = 'all' | ActionPriority | ActionSource;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'P1', label: 'P1' },
  { key: 'P2', label: 'P2' },
  { key: 'P3', label: 'P3' },
  { key: 'crm', label: 'CRM' },
  { key: 'email', label: 'Email' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'business', label: 'Business' },
  { key: 'systems', label: 'Systems' },
  { key: 'agents', label: 'Agents' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'commitments', label: 'Commitments' },
];

function formatDueAt(iso: string | null): string {
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

function goToAction(navigate: ReturnType<typeof useNavigate>, a: BossAction) {
  if (a.deep_link && a.deep_link.startsWith('http')) {
    window.open(a.deep_link, '_blank', 'noopener,noreferrer');
  } else if (a.deep_link) {
    navigate(a.deep_link);
  }
}

export function Actions() {
  const navigate = useNavigate();
  const [actions, setActions] = useState<BossAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    getBossActions().then((res) => {
      if (res.ok) setActions(res.actions);
      else setError(res.error);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!actions) return [];
    if (filter === 'all') return actions;
    return actions.filter((a) => a.priority === filter || a.source === filter);
  }, [actions, filter]);

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
          老板待办 / Boss Action Center
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
      {!actions && !error && <div style={{ color: MUTED, fontSize: 13 }}>加载中…</div>}
      {actions && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>没有符合条件的事项</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((a) => {
          const color = PRIORITY_COLOR[a.priority];
          return (
            <div
              key={a.id}
              onClick={() => goToAction(navigate, a)}
              style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {a.priority}
                </span>
                <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                  {SOURCE_LABEL[a.source]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{a.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace' }}>{formatDueAt(a.due_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                {a.summary}
                {a.related_customer ? ` · ${a.related_customer}` : ''}
                {a.related_system ? ` · ${a.related_system}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
