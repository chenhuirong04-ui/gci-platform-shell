// GCI Executive Desk — Home Dashboard: two charts.
// A. 近7天商务工作趋势 — real crm_followups + crm_customers counts (Task 4
//    functions), bucketed client-side by Dubai calendar day. No fabricated
//    trend: if there's no real signal across the 7 days, an empty state is
//    shown instead of a flat-zero chart.
// B. 当前待办结构 — P1/P2/P3 breakdown of the live Boss Action list (Task 7),
//    same summarizeActions() used everywhere else these counts appear.
// Uses recharts, already a dependency (apps/shell/package.json) and already
// used elsewhere in the repo (modules/trade/components/HomeDashboard.tsx) —
// no new charting library added.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { getSevenDayTrend, type TrendDay } from '../lib/homeTrends';
import { getBossActions, summarizeActions, type ActionCounts } from '../lib/actionCenter';

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

function BacklogChart() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<ActionCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBossActions().then((res) => {
      if (res.ok) setCounts(summarizeActions(res.actions));
      else setError(res.error);
    });
  }, []);

  const total = counts ? counts.p1 + counts.p2 + counts.p3 : 0;
  const data = counts ? [
    { key: 'P1', value: counts.p1, color: RED },
    { key: 'P2', value: counts.p2, color: AMBER },
    { key: 'P3', value: counts.p3, color: MUTED },
  ] : [];

  return (
    <ChartCard title="当前待办结构 · P1 / P2 / P3" onOpen={() => navigate('/actions')}>
      {error ? (
        <div style={{ fontSize: 12, color: RED, padding: '20px 0', textAlign: 'center' }}>读取失败:{error}</div>
      ) : !counts ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '20px 0', textAlign: 'center' }}>加载中…</div>
      ) : total === 0 ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '30px 0', textAlign: 'center' }}>暂无待办事项</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 130, height: 130, flexShrink: 0 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="key" innerRadius={38} outerRadius={60} paddingAngle={2} onClick={() => navigate('/actions')} style={{ cursor: 'pointer' }}>
                  {data.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#14161C', border: `1px solid ${BORD}`, borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.map((d) => (
              <div key={d.key} onClick={() => navigate('/actions')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{d.key}</span>
                <span style={{ color: MUTED }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export function HomeDashboardCharts() {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
      <TrendChart />
      <BacklogChart />
    </div>
  );
}
