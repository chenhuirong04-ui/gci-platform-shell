// GCI Executive Desk — Home Dashboard: 7-day business ACTIVITY trend.
// Read-only, built entirely from existing real data sources — no new
// table, no new API route, no schema change:
//   新询盘 (new inquiries)  — crm_customers.created_at (is_active=true)
//   报价 (quotations)       — business_document_history.document_type='QUOTATION'.created_at
//   合同 (contracts)        — business_document_history.document_type='CONTRACT'.created_at
//   成交 (deals closed)     — crm_followups.status_after containing 成交/执行中, .follow_up_date
//   跟进 (follow-ups)       — crm_followups.follow_up_date (every logged follow-up, any status)
// A category with zero real hits across all 7 days is flagged unavailable
// via `availableSeries` so the UI can omit it entirely instead of drawing a
// flat-zero series — "没有可靠数据就先不显示，不要硬凑".
// Dates are bucketed into Asia/Dubai calendar days for display only; this
// is a date-STRING shift (allowed), never used for absolute time-difference
// math.
import { getRecentFollowupsWithNotes, getRecentNewCustomers } from './crmSupabase';
import { getRecentDocumentCounts } from './businessDocumentHistory';

export interface TrendDay {
  date: string; // YYYY-MM-DD, Dubai calendar day
  label: string; // e.g. "08/17"
  inquiries: number; // 新询盘
  quotations: number; // 报价
  contracts: number; // 合同
  deals: number; // 成交
  followups: number; // 跟进
}

export interface TrendSeriesAvailability {
  inquiries: boolean;
  quotations: boolean;
  contracts: boolean;
  deals: boolean;
  followups: boolean;
}

function dubaiDateStr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function last7DayBuckets(): TrendDay[] {
  const out: TrendDay[] = [];
  const nowDubai = new Date(Date.now() + 4 * 3600 * 1000);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowDubai);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const label = `${date.slice(5, 7)}/${date.slice(8, 10)}`;
    out.push({ date, label, inquiries: 0, quotations: 0, contracts: 0, deals: 0, followups: 0 });
  }
  return out;
}

// crm_followups.status_after is free text (same vocabulary GIA's own
// Notion Follow-up flow uses: 新询盘/合同待签/已报价待确认/执行中/暂缓/...) —
// 成交/执行中 is the closest real signal for "a deal actually moved/closed"
// available without a dedicated deal-stage table.
const DEAL_STATUS_RE = /成交|执行中/;

export async function getSevenDayTrend(): Promise<
  { ok: true; days: TrendDay[]; hasSignal: boolean; availableSeries: TrendSeriesAvailability } | { ok: false; error: string }
> {
  const [followupsRes, customersRes, docsRes] = await Promise.all([
    getRecentFollowupsWithNotes(7),
    getRecentNewCustomers(7),
    getRecentDocumentCounts(7),
  ]);
  if (!followupsRes.ok) return { ok: false, error: followupsRes.error };
  if (!customersRes.ok) return { ok: false, error: customersRes.error };
  if (!docsRes.ok) return { ok: false, error: docsRes.error };

  const days = last7DayBuckets();
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const f of followupsRes.rows) {
    const date = (f.follow_up_date || '').slice(0, 10);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    bucket.followups += 1;
    if (f.status_after && DEAL_STATUS_RE.test(f.status_after)) bucket.deals += 1;
  }
  for (const c of customersRes.rows) {
    const date = dubaiDateStr(c.created_at);
    const bucket = byDate.get(date);
    if (bucket) bucket.inquiries += 1;
  }
  for (const doc of docsRes.rows) {
    const date = dubaiDateStr(doc.created_at);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    if (doc.document_type === 'QUOTATION') bucket.quotations += 1;
    else if (doc.document_type === 'CONTRACT') bucket.contracts += 1;
  }

  const availableSeries: TrendSeriesAvailability = {
    inquiries: days.some((d) => d.inquiries > 0),
    quotations: days.some((d) => d.quotations > 0),
    contracts: days.some((d) => d.contracts > 0),
    deals: days.some((d) => d.deals > 0),
    followups: days.some((d) => d.followups > 0),
  };
  const hasSignal = Object.values(availableSeries).some(Boolean);
  return { ok: true, days, hasSignal, availableSeries };
}
