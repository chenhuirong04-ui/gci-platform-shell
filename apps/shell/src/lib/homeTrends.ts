// GCI Executive Desk — Home Dashboard: 7-day business activity trend.
// Read-only, built entirely from existing Task 4/Task 10 data functions
// (crm_followups.follow_up_date, crm_customers.created_at) — no new table,
// no new API route. Dates are bucketed into Asia/Dubai calendar days for
// display only; this is a date-STRING shift (allowed), never used for
// absolute time-difference math.
import { getRecentFollowupsWithNotes } from './crmSupabase';
import { getRecentNewCustomers } from './crmSupabase';

export interface TrendDay {
  date: string; // YYYY-MM-DD, Dubai calendar day
  label: string; // e.g. "08/17"
  followups: number;
  newCustomers: number;
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
    out.push({ date, label, followups: 0, newCustomers: 0 });
  }
  return out;
}

export async function getSevenDayTrend(): Promise<
  { ok: true; days: TrendDay[]; hasSignal: boolean } | { ok: false; error: string }
> {
  const [followupsRes, customersRes] = await Promise.all([
    getRecentFollowupsWithNotes(7),
    getRecentNewCustomers(7),
  ]);
  if (!followupsRes.ok) return { ok: false, error: followupsRes.error };
  if (!customersRes.ok) return { ok: false, error: customersRes.error };

  const days = last7DayBuckets();
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const f of followupsRes.rows) {
    const date = (f.follow_up_date || '').slice(0, 10);
    const bucket = byDate.get(date);
    if (bucket) bucket.followups += 1;
  }
  for (const c of customersRes.rows) {
    const date = dubaiDateStr(c.created_at);
    const bucket = byDate.get(date);
    if (bucket) bucket.newCustomers += 1;
  }

  const hasSignal = days.some((d) => d.followups > 0 || d.newCustomers > 0);
  return { ok: true, days, hasSignal };
}
