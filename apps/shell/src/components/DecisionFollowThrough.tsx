// GCI Executive Desk — Task 9: 决策执行 / Follow-through.
// Small read-only summary of execution progress on already-decided items.
// No complex dashboard — just counts + up to 5 items, linking to /decisions.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getFollowThroughData, type FollowThroughCounts, type FollowThroughItem } from '../lib/decisionInbox';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<string, string> = { P1: RED, P2: AMBER, P3: MUTED };

export function DecisionFollowThrough() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<FollowThroughCounts | null>(null);
  const [items, setItems] = useState<FollowThroughItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFollowThroughData().then((res) => {
      if (res.ok) {
        setCounts(res.counts);
        setItems(res.items);
      } else {
        setError(res.error);
      }
    });
  }, []);

  const total = counts ? counts.pending + counts.inProgress + counts.blocked : 0;

  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          决策执行 · FOLLOW-THROUGH
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
        {counts && (
          <div style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: 'IBM Plex Mono,monospace' }}>
            <span style={{ color: MUTED }}>待执行 {counts.pending}</span>
            <span style={{ color: AMBER }}>进行中 {counts.inProgress}</span>
            <span style={{ color: RED }}>已阻塞 {counts.blocked}</span>
            <span style={{ color: GOLD }}>今日到期 {counts.dueToday}</span>
          </div>
        )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: '18px 18px', fontSize: 12.5, color: RED }}>读取失败:{error}</div>
        ) : !items ? (
          <div style={{ padding: '18px 18px', fontSize: 12.5, color: MUTED }}>加载中…</div>
        ) : total === 0 && items.length === 0 ? (
          <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 12.5, color: MUTED }}>
            暂无跟踪中的执行事项
          </div>
        ) : (
          items.map((it) => {
            const color = PRIORITY_COLOR[it.priority];
            return (
              <div
                key={it.id}
                onClick={() => navigate('/decisions')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${BORD}`, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace', flexShrink: 0 }}>
                  {it.priority}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{it.reason}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
