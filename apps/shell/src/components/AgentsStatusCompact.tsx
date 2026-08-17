// GCI Executive Desk — Home Layout Cleanup / Task 13: External Agents summary.
// Same AGENTS data/status source as AgentsStatus.tsx — this is only a
// condensed rendering for Home so full detail cards don't stack vertically.
// No status/data logic changed. Channel chips (e.g. E-commerce Assistant's
// NOON/Amazon/Tradeling/Website) show NOT CONNECTED honestly — never a
// fabricated "connected" state.
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
    <div style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {AGENTS.map((a) => (
          <div key={a.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[a.status], flexShrink: 0 }} />
              <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{a.name}</span>
            </div>
            {a.channels && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {a.channels.map((c) => (
                  <span
                    key={c.label}
                    style={{
                      fontSize: 9.5, padding: '2px 6px', borderRadius: 4,
                      color: c.connected ? colors.textPrimary : MUTED,
                      background: c.connected ? 'rgba(203,168,92,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${c.connected ? 'rgba(203,168,92,0.35)' : BORD}`,
                    }}
                  >
                    {c.label}{c.connected ? (c.note ? ` · ${c.note}` : '') : ' · NOT CONNECTED'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
