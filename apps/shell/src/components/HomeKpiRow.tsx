// GCI Executive Desk — Home Dashboard: top KPI row.
// Seven compact number tiles, each backed by an existing read function
// (Tasks 4/7/8/9/5.2/14.1) — no new data source. Click drills into the
// matching existing page. No long text here by design; detail lives one
// click away.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBossActions } from '../lib/actionCenter';
import { getTodaysFollowups } from '../lib/crmSupabase';
import { refreshPendingDecisions, getFollowThroughData } from '../lib/decisionInbox';
import { getTodayEmails } from '../lib/googleSearch';
import { triageEmails } from '../lib/emailAssistant';
import { getMiaStatus } from '../lib/mia';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const BLUE = '#8FA6D4';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

interface Kpi {
  label: string;
  value: number | null;
  color: string;
  onClick: () => void;
}

function KpiTile({ k }: { k: Kpi }) {
  return (
    <div
      onClick={k.onClick}
      style={{ padding: '14px 14px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, cursor: 'pointer', textAlign: 'center' }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: k.value !== null && k.value > 0 ? k.color : MUTED, fontFamily: "'Space Grotesk',sans-serif" }}>
        {k.value === null ? '—' : k.value}
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{k.label}</div>
    </div>
  );
}

export function HomeKpiRow() {
  const navigate = useNavigate();
  const [totalActions, setTotalActions] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);
  const [todaysFollowups, setTodaysFollowups] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<number | null>(null);
  const [pendingExec, setPendingExec] = useState<number | null>(null);
  // 今日邮件/AI建议处理 — both read getTodayEmails() (real Gmail, Dubai-day-
  // scoped, paginated), the exact same function Email Assistant's default
  // view uses. No maxResults=15 cap, no fake fallback number: if Gmail is
  // unreachable both stay null ("—"), never a stale/hardcoded "15".
  const [todayEmailCount, setTodayEmailCount] = useState<number | null>(null);
  const [actionRequiredCount, setActionRequiredCount] = useState<number | null>(null);
  const [miaLeadsToday, setMiaLeadsToday] = useState<number | null>(null);

  useEffect(() => {
    getBossActions().then((res) => {
      if (res.ok) {
        setTotalActions(res.actions.length);
        const now = Date.now();
        setOverdue(res.actions.filter((a) => a.due_at && new Date(a.due_at).getTime() < now).length);
      }
    });
    getTodaysFollowups().then((res) => { if (res.ok) setTodaysFollowups(res.rows.length); });
    refreshPendingDecisions().then((res) => { if (res.ok) setDecisions(res.rows.length); });
    getFollowThroughData().then((res) => { if (res.ok) setPendingExec(res.counts.pending + res.counts.inProgress + res.counts.blocked); });
    getTodayEmails().then((res) => {
      if (!res.ok) { setTodayEmailCount(null); setActionRequiredCount(null); return; }
      setTodayEmailCount(res.results.length);
      if (res.results.length === 0) { setActionRequiredCount(0); return; }
      triageEmails(res.results.map((m) => ({ id: m.id, sender: m.sender, subject: m.subject, snippet: m.snippet, date: m.date }))).then((tres) => {
        if (tres.ok) setActionRequiredCount(tres.results.filter((r) => r.tier === 'must').length);
        // AI classification failing doesn't touch todayEmailCount (already real)
        // — actionRequiredCount just stays null ("—") rather than a guess.
      });
    });
    // Task 14.1: this number comes from MIA only — never from CRM new-customer
    // counts. If MIA isn't reachable/configured, this stays null ("—"), it
    // never falls back to a CRM-derived number.
    getMiaStatus().then((res) => { if (res.ok) setMiaLeadsToday(res.data.leads_found_today); });
  }, []);

  const kpis: Kpi[] = [
    { label: '今日待处理', value: totalActions, color: GOLD, onClick: () => navigate('/actions') },
    { label: '今日客户跟进', value: todaysFollowups, color: BLUE, onClick: () => navigate('/crm?tab=dashboard') },
    { label: '逾期事项', value: overdue, color: RED, onClick: () => navigate('/actions?filter=overdue') },
    { label: '等你决定', value: decisions, color: RED, onClick: () => navigate('/decisions') },
    { label: '待执行', value: pendingExec, color: AMBER, onClick: () => navigate('/decisions') },
    // Real Gmail count, same getTodayEmails() Email Assistant's default
    // "今天" view reads — clicking shows exactly this many emails.
    { label: '今日邮件', value: todayEmailCount, color: BLUE, onClick: () => navigate('/email-assistant') },
    // Same today-email list, filtered to AI tier="must" via the same
    // triageEmails() call Email Assistant uses — deep-links to that page's
    // AI建议处理 filter (still just a filter over "全部", switchable back).
    { label: 'AI建议处理', value: actionRequiredCount, color: GREEN, onClick: () => navigate('/email-assistant?filter=action-required') },
    // Task 18.4 — was '/actions?filter=mia' (a generic Boss Action filter,
    // not an actual lead list). Now opens the real MIA lead bridge.
    { label: '今日新开发潜客(MIA)', value: miaLeadsToday, color: GOLD, onClick: () => navigate('/mia-leads') },
  ];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(8,1fr)', gap: 10, marginBottom: 20 }}>
      {kpis.map((k) => <KpiTile key={k.label} k={k} />)}
    </div>
  );
}
