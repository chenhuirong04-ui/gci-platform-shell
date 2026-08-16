// GCI Executive Desk — Task 7: Boss Action Center / 老板待办中心.
// Read-only aggregation display. Discover → sort → navigate only — no
// action here ever sends, writes, or executes anything.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getBossActions, summarizeActions, SOURCE_LABEL, type BossAction, type ActionPriority } from '../lib/actionCenter';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<ActionPriority, string> = { P1: RED, P2: AMBER, P3: MUTED };

const MAX_HOME_ITEMS = 8;

function formatDueAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const hh = String(dubai.getUTCHours()).padStart(2, '0');
  const mm = String(dubai.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function ActionRow({ a, onClick }: { a: BossAction; onClick: () => void }) {
  const color = PRIORITY_COLOR[a.priority];
  const due = formatDueAt(a.due_at);
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px',
        borderBottom: `1px solid ${BORD}`, cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`,
          borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace', flexShrink: 0, marginTop: 1,
        }}
      >
        {a.priority}
      </span>
      <span
        style={{
          fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4,
          padding: '2px 6px', flexShrink: 0, marginTop: 1,
        }}
      >
        {SOURCE_LABEL[a.source]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 3 }}>{a.title}</div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.summary}
          {a.related_customer ? ` · ${a.related_customer}` : ''}
          {a.related_system ? ` · ${a.related_system}` : ''}
        </div>
      </div>
      {due && <span style={{ fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace', flexShrink: 0, marginTop: 1 }}>{due}</span>}
    </div>
  );
}

function goToAction(navigate: ReturnType<typeof useNavigate>, a: BossAction) {
  if (a.deep_link && a.deep_link.startsWith('http')) {
    window.open(a.deep_link, '_blank', 'noopener,noreferrer');
  } else if (a.deep_link) {
    navigate(a.deep_link);
  }
}

export function BossActionCenter() {
  const navigate = useNavigate();
  const [actions, setActions] = useState<BossAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBossActions().then((res) => {
      if (res.ok) setActions(res.actions);
      else setError(res.error);
    });
  }, []);

  const counts = actions ? summarizeActions(actions) : null;
  const topItems = (actions ?? []).slice(0, MAX_HOME_ITEMS);

  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          老板待办 · BOSS ACTION CENTER
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
        {counts && (
          <div style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: 'IBM Plex Mono,monospace' }}>
            <span style={{ color: RED }}>P1: {counts.p1}</span>
            <span style={{ color: AMBER }}>P2: {counts.p2}</span>
            <span style={{ color: MUTED }}>P3: {counts.p3}</span>
          </div>
        )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: '24px 18px', fontSize: 12.5, color: RED }}>读取失败:{error}</div>
        ) : !actions ? (
          <div style={{ padding: '24px 18px', fontSize: 12.5, color: MUTED }}>加载中…</div>
        ) : counts && counts.p1 === 0 && topItems.length === 0 ? (
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>当前无紧急事项</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>所有事项跟进正常</div>
          </div>
        ) : (
          <>
            {counts && counts.p1 === 0 && (
              <div style={{ padding: '10px 16px', fontSize: 11.5, color: GREEN, borderBottom: `1px solid ${BORD}` }}>
                当前无紧急事项 — 以下为需要关注 / 留意的事项
              </div>
            )}
            {topItems.map((a) => (
              <ActionRow key={a.id} a={a} onClick={() => goToAction(navigate, a)} />
            ))}
          </>
        )}
      </div>

      {actions && actions.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <span
            onClick={() => navigate('/actions')}
            style={{ fontSize: 11.5, color: GOLD, cursor: 'pointer' }}
          >
            查看全部 ({actions.length}) →
          </span>
        </div>
      )}
    </div>
  );
}
