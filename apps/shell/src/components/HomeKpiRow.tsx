// GCI Executive Desk — Home Dashboard: top-level entry row.
// GCI Home Final Structure — replaces the old 8-tile KPI row. Audit found
// 6 of the 8 old tiles were re-slicing the same 2-3 underlying datasets
// (今日待处理/逾期事项/客户跟进 all derived from getBossActions(); 等你决定/
// 待执行 both from executive_decisions; 今日邮件/AI建议处理 both from the
// same Gmail today-list) — confusing in daily use per Chris. Down to 4
// entries, each backed by exactly ONE source, matching the approved final
// structure:
//   我的事项      -> executive_tasks only (getExecutiveTasks), -> /tasks
//   需要我决定    -> executive_decisions, status=pending only, -> /decisions
//   重要消息      -> today's Gmail, AI-flagged action-required subset, -> /email-assistant
//   新业务机会    -> MIA leads_found_today; shows an honest "暂不可用"
//                    state (not a stale "—") when MIA itself reports failure,
//                    never a fabricated number.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@gci/i18n';
import { getExecutiveTasks } from '../lib/executiveTasks';
import { refreshPendingDecisions } from '../lib/decisionInbox';
import { getTodayEmails } from '../lib/googleSearch';
import { triageEmails } from '../lib/emailAssistant';
import { getMiaStatus } from '../lib/mia';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const BLUE = '#8FA6D4';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type KpiValue = number | null | 'unavailable';

interface Kpi {
  label: string;
  value: KpiValue;
  color: string;
  onClick: () => void;
}

function KpiTile({ k, lang }: { k: Kpi; lang: 'zh' | 'en' }) {
  const display = k.value === null ? '—' : k.value === 'unavailable' ? (lang === 'zh' ? '暂不可用' : 'Unavailable') : String(k.value);
  const isNumberWithValue = typeof k.value === 'number' && k.value > 0;
  return (
    <div
      onClick={k.onClick}
      style={{ padding: '16px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, cursor: 'pointer', textAlign: 'center' }}
    >
      <div style={{ fontSize: k.value === 'unavailable' ? 14 : 24, fontWeight: 700, color: isNumberWithValue ? k.color : MUTED, fontFamily: "'Space Grotesk',sans-serif" }}>
        {display}
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{k.label}</div>
    </div>
  );
}

export function HomeKpiRow() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const [myItems, setMyItems] = useState<KpiValue>(null);
  const [decisions, setDecisions] = useState<KpiValue>(null);
  const [importantMessages, setImportantMessages] = useState<KpiValue>(null);
  const [miaLeadsToday, setMiaLeadsToday] = useState<KpiValue>(null);

  useEffect(() => {
    // 我的事项 — executive_tasks ONLY, never mixed with email/decisions/MIA.
    // Open + in-progress (not completed/cancelled) is the same "still on my
    // plate" definition /tasks itself uses to exclude Completed by default.
    getExecutiveTasks().then((res) => {
      if (res.ok) setMyItems(res.rows.filter((t) => t.status === 'open' || t.status === 'in_progress').length);
    });

    // 需要我决定 — same refreshPendingDecisions() Decisions.tsx's own default
    // view now uses (status=pending only) — Home's number and the page's
    // default list are guaranteed to agree.
    refreshPendingDecisions().then((res) => { if (res.ok) setDecisions(res.rows.length); });

    // 重要消息 — today's real Gmail, AI-flagged action-required subset
    // (same triageEmails() call Email Assistant uses internally). This
    // replaces the old separate 今日邮件/AI建议处理 tiles with one number:
    // what actually needs Chris's attention, not raw email volume.
    getTodayEmails().then((res) => {
      if (!res.ok) { setImportantMessages(null); return; }
      if (res.results.length === 0) { setImportantMessages(0); return; }
      triageEmails(res.results.map((m) => ({ id: m.id, sender: m.sender, subject: m.subject, snippet: m.snippet, date: m.date }))).then((tres) => {
        setImportantMessages(tres.ok ? tres.results.filter((r) => r.tier === 'must').length : null);
      });
    });

    // 新业务机会 (MIA) — never a fabricated number, never a permanent "—".
    // A real MIA failure (timeout/error) now shows "暂不可用" so it reads as
    // "MIA is down" rather than "loading forever" or "zero leads".
    getMiaStatus().then((res) => setMiaLeadsToday(res.ok ? res.data.leads_found_today : 'unavailable'));
  }, []);

  const kpis: Kpi[] = [
    { label: lang === 'zh' ? '我的事项' : 'My Tasks', value: myItems, color: GOLD, onClick: () => navigate('/tasks') },
    { label: lang === 'zh' ? '需要我决定' : 'Needs My Decision', value: decisions, color: RED, onClick: () => navigate('/decisions') },
    { label: lang === 'zh' ? '重要消息' : 'Important Messages', value: importantMessages, color: BLUE, onClick: () => navigate('/email-assistant') },
    { label: lang === 'zh' ? '新业务机会' : 'New Business Opportunities', value: miaLeadsToday, color: GREEN, onClick: () => navigate('/mia-leads') },
  ];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
      {kpis.map((k) => <KpiTile key={k.label} k={k} lang={lang} />)}
    </div>
  );
}
