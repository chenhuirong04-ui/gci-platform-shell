// GCI Executive Desk — Task 8: Decision Inbox / 等你决定.
// Displays only items that genuinely require Chris's judgment. Clicking an
// option only records the decision to executive_decisions — it never sends
// email, changes CRM/quotes, deletes systems, or runs anything externally.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  refreshPendingDecisions,
  recordDecision,
  DECISION_SOURCE_LABEL,
  type ExecutiveDecision,
} from '../lib/decisionInbox';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<string, string> = { P1: RED, P2: AMBER, P3: MUTED };
const MAX_HOME_ITEMS = 5;

function DecisionCard({ d, onDecide }: { d: ExecutiveDecision; onDecide: (id: string, key: string) => void }) {
  const color = PRIORITY_COLOR[d.priority] ?? MUTED;
  return (
    <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace' }}>
          {d.priority}
        </span>
        <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 6px' }}>
          {DECISION_SOURCE_LABEL[d.source]}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{d.title}</span>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
        <span style={{ color: GOLD, fontWeight: 700 }}>Reason: </span>
        {d.reason}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
        {d.decision_options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onDecide(d.id, opt.key)}
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
    </div>
  );
}

export function DecisionInbox() {
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<ExecutiveDecision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    refreshPendingDecisions().then((res) => {
      if (res.ok) setDecisions(res.rows);
      else setError(res.error);
    });
  }

  useEffect(() => { load(); }, []);

  async function handleDecide(id: string, optionKey: string) {
    setBusyId(id);
    const res = await recordDecision(id, optionKey);
    setBusyId(null);
    if (res.ok) {
      // "later" leaves it pending — keep it visible; anything else resolves it.
      if (optionKey === 'later') return;
      setDecisions((prev) => (prev ?? []).filter((d) => d.id !== id));
    }
  }

  const topItems = (decisions ?? []).slice(0, MAX_HOME_ITEMS);

  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          DECISION INBOX · 等你决定
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>

      {error ? (
        <div style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: RED }}>
          读取失败:{error}
        </div>
      ) : !decisions ? (
        <div style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: MUTED }}>
          加载中…
        </div>
      ) : decisions.length === 0 ? (
        <div style={{ padding: '24px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: MUTED }}>暂无需要你决定的事项</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: colors.textPrimary, marginBottom: 10 }}>
            <strong style={{ color: GOLD }}>{decisions.length}</strong> 件事项等待 Chris 决定
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topItems.map((d) => (
              <div key={d.id} style={{ opacity: busyId === d.id ? 0.5 : 1 }}>
                <DecisionCard d={d} onDecide={handleDecide} />
              </div>
            ))}
          </div>
        </>
      )}

      {decisions && decisions.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <span onClick={() => navigate('/decisions')} style={{ fontSize: 11.5, color: GOLD, cursor: 'pointer' }}>
            查看全部 ({decisions.length}) →
          </span>
        </div>
      )}
    </div>
  );
}
