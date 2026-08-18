// GCI Executive Desk — Home Layout Cleanup / Task 13/14.1: External Agents summary.
// MIA's card now overlays a live fetch from getMiaStatus() (server-side
// adapter → MIA's own /api/executive-status) on top of the static AGENTS
// entry — status/counts become real once MIA_EXECUTIVE_STATUS_SECRET is
// configured on both sides; until then it falls back to the static
// "no_data" entry, never a fabricated number. E-commerce Assistant / Growth
// Agent stay static (no live source connected this round). Channel chips
// (NOON/Amazon/Tradeling/Website) show NOT CONNECTED honestly.
import { useEffect, useState } from 'react';
import { colors } from '@gci/design-system';
import { AGENTS, type AgentStatus } from './AgentsStatus';
import { getMiaStatus, type MiaStatus } from '../lib/mia';
import { getChanyaStatus, type ChanyaStatus } from '../lib/chanya';

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
  const [mia, setMia] = useState<MiaStatus | null>(null);
  const [chanya, setChanya] = useState<ChanyaStatus | null>(null);

  useEffect(() => {
    getMiaStatus().then((res) => { if (res.ok) setMia(res.data); });
    getChanyaStatus().then((res) => { if (res.ok) setChanya(res.data); });
  }, []);

  const isMia = (name: string) => name.startsWith('MIA');
  const isChanya = (name: string) => name.startsWith('Chanya');

  return (
    <div style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {AGENTS.map((a) => {
          const status: AgentStatus = isMia(a.name) && mia ? mia.status : isChanya(a.name) && chanya ? chanya.status : a.status;
          return (
            <div key={a.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{a.name}</span>
              </div>
              {isMia(a.name) && mia && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5, color: MUTED }}>
                  <span>新开发 <strong style={{ color: colors.textPrimary }}>{mia.leads_found_today}</strong></span>
                  <span>已触达 <strong style={{ color: colors.textPrimary }}>{mia.contacted_today}</strong></span>
                  <span>回复 <strong style={{ color: colors.textPrimary }}>{mia.replies_today}</strong></span>
                  <span>需处理 <strong style={{ color: mia.needs_chris > 0 ? AMBER : colors.textPrimary }}>{mia.needs_chris}</strong></span>
                </div>
              )}
              {isMia(a.name) && mia?.last_updated && (
                <div style={{ fontSize: 9.5, color: MUTED }}>Last updated: {new Date(mia.last_updated).toLocaleString('zh-CN')}</div>
              )}
              {isMia(a.name) && !mia && (
                <div style={{ fontSize: 10.5, color: MUTED }}>{a.todaySummary}</div>
              )}
              {isChanya(a.name) && chanya && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5, color: MUTED }}>
                  <span>今日新注册 <strong style={{ color: colors.textPrimary }}>{chanya.new_signups_today}</strong></span>
                  <span>新付费 <strong style={{ color: colors.textPrimary }}>{chanya.new_paid_today}</strong></span>
                  <span>收入 <strong style={{ color: colors.textPrimary }}>{chanya.currency} {chanya.revenue_today}</strong></span>
                  <span>支付失败 <strong style={{ color: chanya.payment_failures_today > 0 ? RED : colors.textPrimary }}>{chanya.payment_failures_today}</strong></span>
                  <span>需处理 <strong style={{ color: chanya.needs_chris > 0 ? AMBER : colors.textPrimary }}>{chanya.needs_chris}</strong></span>
                </div>
              )}
              {isChanya(a.name) && chanya?.last_updated && (
                <div style={{ fontSize: 9.5, color: MUTED }}>Last updated: {new Date(chanya.last_updated).toLocaleString('zh-CN')}</div>
              )}
              {isChanya(a.name) && !chanya && (
                <div style={{ fontSize: 10.5, color: MUTED }}>{a.todaySummary}</div>
              )}
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
          );
        })}
      </div>
    </div>
  );
}
