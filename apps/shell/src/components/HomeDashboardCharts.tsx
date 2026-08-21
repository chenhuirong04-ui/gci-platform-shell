// GCI Executive Desk — Home Dashboard: two charts.
// A. 近7天商务工作趋势 — real crm_followups + crm_customers counts (Task 4
//    functions), bucketed client-side by Dubai calendar day. No fabricated
//    trend: if there's no real signal across the 7 days, an empty state is
//    shown instead of a flat-zero chart.
// B. 当前业务事项结构 — GCI Home Final Cleanup §2: replaces the old P1/P2/P3
//    backlog pie with a business-meaning category breakdown (执照/公司服务,
//    系统开发/AI项目, 客户跟进, 报价/合同, 劳务/Workforce, 供应商/采购,
//    客服/售后, 内部事项/其他) of the same live Boss Action list (Task 7).
//    Priority (P1/P2/P3) is unchanged underneath — every BossAction still
//    carries it — this only changes what Home groups by. Clicking a
//    category expands the real items inline (客户/项目, 事项, 状态, 下一步).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getSevenDayTrend, type TrendDay } from '../lib/homeTrends';
import {
  getBossActions, summarizeBusinessStructure, BUSINESS_STRUCTURE_CATEGORIES,
  type BossAction, type BusinessStructureCategory,
} from '../lib/actionCenter';

// Display-only i18n (Chris request) — BUSINESS_STRUCTURE_CATEGORIES itself
// lives in actionCenter.ts (out of scope for this fix) and stays unchanged
// as the grouping key; this is purely an alternate English label for the
// same fixed category value, shown only in EN mode instead of the
// zh/en-mixed string ("劳务 / Workforce") the raw category constant uses.
const CATEGORY_LABEL_EN: Record<BusinessStructureCategory, string> = {
  '执照 / 公司服务': 'License / Company Services',
  '系统开发 / AI项目': 'Systems / AI Projects',
  '客户跟进': 'Customer Follow-up',
  '报价 / 合同': 'Quotation / Contracts',
  '劳务 / Workforce': 'Workforce',
  '供应商 / 采购': 'Suppliers / Procurement',
  '客服 / 售后': 'Support / After-sales',
  '内部事项 / 其他': 'Internal / Other',
};

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const BLUE = '#8FA6D4';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function ChartCard({ title, onOpen, children }: { title: string; onOpen?: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{title}</span>
        {onOpen && (
          <span onClick={onOpen} style={{ fontSize: 11, color: GOLD, cursor: 'pointer' }}>查看全部 →</span>
        )}
      </div>
      {children}
    </div>
  );
}

function TrendChart() {
  const [days, setDays] = useState<TrendDay[] | null>(null);
  const [hasSignal, setHasSignal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSevenDayTrend().then((res) => {
      if (res.ok) { setDays(res.days); setHasSignal(res.hasSignal); }
      else setError(res.error);
    });
  }, []);

  return (
    <ChartCard title="近7天商务工作趋势 · CRM跟进 / 新客户">
      {error ? (
        <div style={{ fontSize: 12, color: RED, padding: '20px 0', textAlign: 'center' }}>读取失败:{error}</div>
      ) : !days ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '20px 0', textAlign: 'center' }}>加载中…</div>
      ) : !hasSignal ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '30px 0', textAlign: 'center' }}>历史数据不足，暂无可展示的趋势</div>
      ) : (
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <BarChart data={days} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} axisLine={{ stroke: BORD }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: '#14161C', border: `1px solid ${BORD}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: colors.textPrimary }}
              />
              <Bar dataKey="followups" name="CRM跟进" fill={BLUE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="newCustomers" name="新客户" fill={GOLD} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

const PRIORITY_COLOR: Record<string, string> = { P1: RED, P2: AMBER, P3: MUTED };

function BusinessStructureChart() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const [actions, setActions] = useState<BossAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<BusinessStructureCategory | null>(null);

  useEffect(() => {
    getBossActions().then((res) => {
      if (res.ok) setActions(res.actions);
      else setError(res.error);
    });
  }, []);

  const byCategory = actions ? summarizeBusinessStructure(actions) : null;
  const total = actions ? actions.length : 0;
  const maxCount = byCategory ? Math.max(1, ...BUSINESS_STRUCTURE_CATEGORIES.map((c) => byCategory[c].length)) : 1;

  return (
    <ChartCard title={lang === 'zh' ? '当前业务事项结构' : 'Current Business Structure'} onOpen={() => navigate('/actions')}>
      {error ? (
        <div style={{ fontSize: 12, color: RED, padding: '20px 0', textAlign: 'center' }}>{lang === 'zh' ? `读取失败:${error}` : `Failed to load: ${error}`}</div>
      ) : !byCategory ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '20px 0', textAlign: 'center' }}>{lang === 'zh' ? '加载中…' : 'Loading…'}</div>
      ) : total === 0 ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '30px 0', textAlign: 'center' }}>{lang === 'zh' ? '暂无待办事项' : 'No open items'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {BUSINESS_STRUCTURE_CATEGORIES.map((cat) => {
            const items = byCategory[cat];
            const isOpen = expanded === cat;
            const catLabel = lang === 'zh' ? cat : CATEGORY_LABEL_EN[cat];
            return (
              <div key={cat}>
                <div
                  onClick={() => items.length > 0 && setExpanded(isOpen ? null : cat)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', cursor: items.length > 0 ? 'pointer' : 'default', opacity: items.length > 0 ? 1 : 0.4 }}
                >
                  <span style={{ fontSize: 11.5, color: colors.textPrimary, width: 112, flexShrink: 0 }}>{catLabel}</span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(items.length / maxCount) * 100}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: MUTED, width: 18, textAlign: 'right', flexShrink: 0 }}>{items.length}</span>
                </div>
                {isOpen && (
                  <div style={{ margin: '4px 0 8px 4px', padding: '8px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((a) => (
                      <div key={a.id} onClick={() => a.deep_link && navigate(a.deep_link)} style={{ cursor: a.deep_link ? 'pointer' : 'default', fontSize: 11.5, lineHeight: 1.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[a.priority] ?? MUTED, flexShrink: 0 }} />
                          <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{a.related_customer || a.related_system || '—'}</span>
                          <span style={{ color: MUTED }}>· {a.title}</span>
                        </div>
                        {a.summary && <div style={{ color: MUTED, marginLeft: 12 }}>{lang === 'zh' ? `下一步：${a.summary}` : `Next: ${a.summary}`}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

export function HomeDashboardCharts() {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
      <TrendChart />
      <BusinessStructureChart />
    </div>
  );
}
