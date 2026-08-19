// GCI Executive Desk — Task 18.4: MIA Detail Bridge.
// Read-only bridge into MIA's own executive-status data — never a second
// database, never a copy of MIA's search/scoring/research logic. Shows
// today's leads + needs-Chris items so GIA never has to bounce out to the
// MIA app just to see who a number refers to. "打开 MIA" stays the escape
// hatch for real research/re-scoring work.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getMiaStatus, type MiaStatus } from '../lib/mia';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const MIA_BASE_URL = 'https://gci-ai-sales-agent.vercel.app';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

export function MiaLeads() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'needs_chris' ? 'needs_chris' : 'leads';

  const [status, setStatus] = useState<MiaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getMiaStatus().then((res) => {
      setLoading(false);
      if (res.ok) setStatus(res.data);
      else setError(res.error);
    });
  }, []);

  const leads = useMemo(() => status?.recent_leads ?? [], [status]);
  const needsChrisItems = useMemo(() => status?.needs_chris_items ?? [], [status]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button onClick={() => navigate('/')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>← 返回</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>MIA｜客户开发 AI</h1>
        <div style={{ flex: 1 }} />
        <a href={MIA_BASE_URL} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: MUTED, textDecoration: 'none' }}>
          打开 MIA（研究/改搜索条件/重新评分）→
        </a>
      </div>

      {loading && <div style={{ fontSize: 13, color: MUTED }}>加载中…</div>}
      {error && <div style={{ fontSize: 13, color: RED }}>读取失败:{error}</div>}

      {status && (
        <>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 12.5, color: MUTED, flexWrap: 'wrap' }}>
            <span>今日新增 <strong style={{ color: TEXT }}>{status.leads_found_today}</strong></span>
            <span>已研究 <strong style={{ color: TEXT }}>{status.researched_today}</strong></span>
            <span>已触达 <strong style={{ color: TEXT }}>{status.contacted_today}</strong></span>
            <span>回复 <strong style={{ color: TEXT }}>{status.replies_today}</strong></span>
            <span>需处理 <strong style={{ color: status.needs_chris > 0 ? AMBER : TEXT }}>{status.needs_chris}</strong></span>
            <div style={{ flex: 1 }} />
            <span>更新于 {fmtTime(status.last_updated)}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button
              onClick={() => setSearchParams({ tab: 'leads' })}
              style={{ padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: tab === 'leads' ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)', border: `1px solid ${tab === 'leads' ? 'transparent' : BORD}`, color: tab === 'leads' ? '#080D1E' : MUTED, fontWeight: tab === 'leads' ? 700 : 400 }}
            >
              今日潜客 · {leads.length}
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'needs_chris' })}
              style={{ padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: tab === 'needs_chris' ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)', border: `1px solid ${tab === 'needs_chris' ? 'transparent' : BORD}`, color: tab === 'needs_chris' ? '#080D1E' : MUTED, fontWeight: tab === 'needs_chris' ? 700 : 400 }}
            >
              需要处理 · {needsChrisItems.length}
            </button>
          </div>

          {tab === 'leads' && (
            leads.length === 0 ? (
              <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
                MIA 尚未返回今日潜客明细（今日汇总显示 {status.leads_found_today} 条，但 MIA 的 /api/executive-status 还没有提供逐条数据）。接口扩展后这里会自动显示，无需再改 GCI 代码。目前可以点右上角"打开 MIA"直接查看。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leads.map((l) => (
                  <div
                    key={l.lead_id}
                    onClick={() => navigate(`/mia-leads/${encodeURIComponent(l.lead_id)}`)}
                    style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', background: CARD, border: `1px solid ${BORD}` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{l.company_name}</span>
                      {l.priority && <span style={{ fontSize: 10, color: AMBER, background: 'rgba(212,168,67,0.12)', borderRadius: 4, padding: '2px 6px' }}>{l.priority}</span>}
                      {l.country && <span style={{ fontSize: 11, color: MUTED }}>{l.country}</span>}
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 10.5, color: MUTED }}>{fmtTime(l.created_at)}</span>
                    </div>
                    {l.why_relevant && <div style={{ fontSize: 12, color: MUTED }}>{l.why_relevant}</div>}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'needs_chris' && (
            needsChrisItems.length === 0 ? (
              <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
                {status.needs_chris > 0
                  ? `汇总显示有 ${status.needs_chris} 件需要处理，但 MIA 的 /api/executive-status 还没有提供逐条明细。接口扩展后这里会自动显示。`
                  : '当前没有需要处理的事项。'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {needsChrisItems.map((it) => (
                  <div
                    key={it.id}
                    onClick={() => it.lead_id && navigate(`/mia-leads/${encodeURIComponent(it.lead_id)}`)}
                    style={{ padding: '12px 16px', borderRadius: 10, cursor: it.lead_id ? 'pointer' : 'default', background: CARD, border: `1px solid ${BORD}` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{it.company_name}</span>
                      {it.priority && <span style={{ fontSize: 10, color: RED, background: 'rgba(224,132,106,0.14)', borderRadius: 4, padding: '2px 6px' }}>{it.priority}</span>}
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 10.5, color: MUTED }}>{fmtTime(it.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: TEXT, marginBottom: 3 }}>{it.reason}</div>
                    {it.suggested_action && <div style={{ fontSize: 11.5, color: MUTED }}>建议: {it.suggested_action}</div>}
                    {it.lead_id && <div style={{ fontSize: 10.5, color: GOLD, marginTop: 4 }}>点击查看对应潜客 →</div>}
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
