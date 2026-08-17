// GCI Executive Desk — Home Layout Cleanup: AI Agents compact summary.
// Same AGENTS data/status source as AgentsStatus.tsx (Task 4.1) — this is
// only a condensed one-row rendering for Home so 4 full detail cards don't
// stack vertically. No status/data logic changed.
import { colors } from '@gci/design-system';
import { AGENTS, type AgentStatus } from './AgentsStatus';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const STATUS_COLOR: Record<AgentStatus, string> = {
  healthy: '#6FBF8E',
  warning: AMBER,
  error: RED,
  no_data: MUTED,
  deferred: GOLD,
};

export function AgentsStatusCompact() {
  return (
    <div style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{AGENTS.length}</div>
        <div style={{ fontSize: 10.5, color: MUTED }}>AI 员工</div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {AGENTS.map((a) => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[a.status], flexShrink: 0 }} />
            <span style={{ color: colors.textPrimary }}>{a.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
