// GCI Executive Desk — Home Layout Cleanup / Task 13/14.1: External Agents summary.
// MIA's automatic real-time read is temporarily switched off (product
// decision: MIA is non-core, production reads are unreliable/no_data, and
// this was one of 3 uncoordinated getMiaStatus() calls firing on every Home
// load). This is NOT a removal of MIA — mia.ts and /api/mia/executive-status
// are untouched and ready to reconnect once MIA itself is reworked; this
// card just shows a static "not connected" line instead of fetching. Chanya
// is unrelated to this change and keeps its own live fetch exactly as
// before. E-commerce Assistant / Growth Agent stay static (no live source
// connected this round). Channel chips (NOON/Amazon/Tradeling/Website) show
// NOT CONNECTED honestly.
import { useEffect, useState } from 'react';
import { useI18n } from '@gci/i18n';
import { colors } from '@gci/design-system';
import { AGENTS, type AgentStatus } from './AgentsStatus';
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
  const { lang } = useI18n();
  const [chanya, setChanya] = useState<ChanyaStatus | null>(null);

  useEffect(() => {
    getChanyaStatus().then((res) => { if (res.ok) setChanya(res.data); });
  }, []);

  const isMia = (name: string) => name.startsWith('MIA');
  const isChanya = (name: string) => name.startsWith('Chanya');

  return (
    <div style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {AGENTS.map((a) => {
          const status: AgentStatus = isChanya(a.name) && chanya ? chanya.status : a.status;
          return (
            <div key={a.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{a.name}</span>
              </div>
              {isMia(a.name) && (
                <div style={{ fontSize: 10.5, color: MUTED }}>{lang === 'zh' ? '暂未连接' : 'Not connected'}</div>
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
