// GCI Executive Desk — Home Dashboard chart(s).
// 近7天经营活动趋势 — real business-activity counts (新询盘/报价/合同/成交/跟进,
// see lib/homeTrends.ts for each series' real data source), bucketed
// client-side by Dubai calendar day. No fabricated trend: a series with
// zero real hits across all 7 days is omitted entirely rather than drawn
// as a flat-zero bar, and if NO series has any signal the whole chart
// shows an empty state instead.
//
// 当前业务事项结构 (removed) — this card counted executive_tasks/BossAction
// rows (operational to-dos: file uploads, reminders, invoices due, etc.),
// not real businesses/projects/customer opportunities the way Chris reads
// it ("劳务：兵团、海汀顿 = 2笔"). Read-only check confirmed there is no
// single reliable "real business/project" master data source Home can
// count from today — CRM customers, quotation_records, service_customers,
// and executive_tasks are four separate systems with no unified "how many
// real deals are open" view, and building that view would be a new
// cross-system data model (explicitly out of scope for this round). Per
// the explicit instruction, the honest fix is to remove the card rather
// than keep patching a metric that was never counting the right thing —
// actionCenter.ts's getBossActions()/summarizeBusinessStructure()/
// BUSINESS_STRUCTURE_CATEGORIES are untouched (DailyWorkbench.tsx still
// uses them) and executive_tasks/GIA classification are untouched.
import { useEffect, useState } from 'react';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { getSevenDayTrend, type TrendDay, type TrendSeriesAvailability } from '../lib/homeTrends';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const BLUE = '#8FA6D4';
const GREEN = '#6FBF8E';
const AMBER = '#D4A843';
const PURPLE = '#B08FD4';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const SERIES: { key: keyof TrendSeriesAvailability; dataKey: keyof TrendDay; nameZh: string; nameEn: string; color: string }[] = [
  { key: 'inquiries', dataKey: 'inquiries', nameZh: '新询盘', nameEn: 'New Inquiries', color: GOLD },
  { key: 'quotations', dataKey: 'quotations', nameZh: '报价', nameEn: 'Quotations', color: AMBER },
  { key: 'contracts', dataKey: 'contracts', nameZh: '合同', nameEn: 'Contracts', color: PURPLE },
  { key: 'deals', dataKey: 'deals', nameZh: '成交', nameEn: 'Deals Closed', color: GREEN },
  { key: 'followups', dataKey: 'followups', nameZh: '跟进', nameEn: 'Follow-ups', color: BLUE },
];

function ChartCard({ title, onOpen, lang, children }: { title: string; onOpen?: () => void; lang: 'zh' | 'en'; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{title}</span>
        {onOpen && (
          <span onClick={onOpen} style={{ fontSize: 11, color: GOLD, cursor: 'pointer' }}>{lang === 'zh' ? '查看全部 →' : 'View all →'}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function TrendChart() {
  const { lang } = useI18n();
  const [days, setDays] = useState<TrendDay[] | null>(null);
  const [hasSignal, setHasSignal] = useState(true);
  const [availableSeries, setAvailableSeries] = useState<TrendSeriesAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSevenDayTrend().then((res) => {
      if (res.ok) { setDays(res.days); setHasSignal(res.hasSignal); setAvailableSeries(res.availableSeries); }
      else setError(res.error);
    });
  }, []);

  const visibleSeries = SERIES.filter((s) => availableSeries?.[s.key]);

  return (
    <ChartCard title={lang === 'zh' ? '近7天经营活动趋势 · 新询盘 / 报价 / 合同 / 成交 / 跟进' : '7-Day Business Activity · Inquiries / Quotations / Contracts / Deals / Follow-ups'} lang={lang}>
      {error ? (
        <div style={{ fontSize: 12, color: RED, padding: '20px 0', textAlign: 'center' }}>{lang === 'zh' ? `读取失败:${error}` : `Failed to load: ${error}`}</div>
      ) : !days ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '20px 0', textAlign: 'center' }}>{lang === 'zh' ? '加载中…' : 'Loading…'}</div>
      ) : !hasSignal ? (
        <div style={{ fontSize: 12, color: MUTED, padding: '30px 0', textAlign: 'center' }}>{lang === 'zh' ? '历史数据不足，暂无可展示的趋势' : 'Not enough history yet to show a trend.'}</div>
      ) : (
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={days} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} axisLine={{ stroke: BORD }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: '#14161C', border: `1px solid ${BORD}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: colors.textPrimary }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span style={{ color: MUTED }}>{value}</span>} />
              {visibleSeries.map((s) => (
                <Bar key={s.dataKey} dataKey={s.dataKey} name={lang === 'zh' ? s.nameZh : s.nameEn} fill={s.color} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

export function HomeDashboardCharts() {
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 12, marginBottom: 20 }}>
      <TrendChart />
    </div>
  );
}
