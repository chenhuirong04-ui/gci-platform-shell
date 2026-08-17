// GCI Executive Desk — Home Dashboard: Top 3 priorities.
// Exactly 3 items, taken from the same live getBossActions() list (Task 7)
// used everywhere else — no separate priority logic. The "建议" line is a
// deterministic, rule-based one-liner derived from existing fields
// (priority/source/due_at) — not an AI call, so it never fabricates a fact
// and never adds new API usage to the Home page. Full email subject/snippet
// text is intentionally never shown here (only related_customer + a short
// summary) — that detail lives on /email-assistant.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getBossActions, SOURCE_LABEL, type BossAction, type ActionPriority } from '../lib/actionCenter';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<ActionPriority, string> = { P1: RED, P2: AMBER, P3: MUTED };

// Deterministic, source/priority-driven suggestion text — never invented per item.
function suggestionFor(a: BossAction): string {
  if (a.source === 'email') return '建议：今天回复或确认是否需要跟进';
  if (a.source === 'calendar') return '建议：提前确认会议材料/是否需要准备';
  if (a.source === 'decisions') return '建议：今天做出决定，避免继续搁置';
  if (a.source === 'commitments') return '建议：今天兑现或更新进度';
  if (a.priority === 'P1') return '建议：今天优先处理';
  if (a.due_at && new Date(a.due_at).getTime() < Date.now()) return '建议：已逾期，尽快跟进';
  return '建议：按计划推进';
}

function goToAction(navigate: ReturnType<typeof useNavigate>, a: BossAction) {
  if (a.deep_link && a.deep_link.startsWith('http')) {
    window.open(a.deep_link, '_blank', 'noopener,noreferrer');
  } else if (a.deep_link) {
    navigate(a.deep_link);
  } else {
    navigate('/actions');
  }
}

export function HomeTopPriorities() {
  const navigate = useNavigate();
  const [actions, setActions] = useState<BossAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBossActions().then((res) => {
      if (res.ok) setActions(res.actions);
      else setError(res.error);
    });
  }, []);

  const top3 = (actions ?? []).slice(0, 3);

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          今天最重要的事 · TOP 3
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
        {actions && actions.length > 0 && (
          <span onClick={() => navigate('/actions')} style={{ fontSize: 11, color: GOLD, cursor: 'pointer' }}>
            查看全部 ({actions.length}) →
          </span>
        )}
      </div>

      {error ? (
        <div style={{ padding: '18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: RED }}>读取失败:{error}</div>
      ) : !actions ? (
        <div style={{ padding: '18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: MUTED }}>加载中…</div>
      ) : top3.length === 0 ? (
        <div style={{ padding: '30px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, textAlign: 'center', fontSize: 12.5, color: MUTED }}>
          今天暂无重点事项
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {top3.map((a) => {
            const color = PRIORITY_COLOR[a.priority];
            return (
              <div key={a.id} style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace' }}>
                    {a.priority}
                  </span>
                  <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 6px' }}>
                    {SOURCE_LABEL[a.source]}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>
                  {a.related_customer || a.title}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                  {a.summary || a.title}
                </div>
                <div style={{ fontSize: 11.5, color: GOLD }}>{suggestionFor(a)}</div>
                <div
                  onClick={() => goToAction(navigate, a)}
                  style={{ marginTop: 2, alignSelf: 'flex-start', fontSize: 11, color: colors.textPrimary, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}
                >
                  查看客户 →
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
