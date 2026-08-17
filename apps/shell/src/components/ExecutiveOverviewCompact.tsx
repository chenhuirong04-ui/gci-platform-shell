// GCI Executive Desk — Home Layout Cleanup: 经营概览 · CRM compact KPI row.
// Presentation-only replacement for the old ExecutiveDeskToday's 4 stacked
// full lists — same Task 4 data functions (crm_customers/crm_contacts/
// crm_followups via Supabase), same counts, just rendered as one compact
// stat row instead of four expanded lists. Click-through goes to CRM.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getTodaysFollowups,
  getOverdueFollowups,
  getRecentNewCustomers,
  getBossDecisions,
} from '../lib/crmSupabase';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const BLUE = '#5BA3C9';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function Stat({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'Space Grotesk',sans-serif" }}>{value === null ? '—' : value}</div>
      <div style={{ fontSize: 10.5, color: MUTED }}>{label}</div>
    </div>
  );
}

export function ExecutiveOverviewCompact() {
  const navigate = useNavigate();
  const [today, setToday] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);
  const [newCustomers, setNewCustomers] = useState<number | null>(null);
  const [crmDecisions, setCrmDecisions] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getTodaysFollowups(), getOverdueFollowups(), getRecentNewCustomers(7), getBossDecisions()])
      .then(([t, o, n, d]) => {
        if (t.ok) setToday(t.rows.length); else setError(t.error);
        if (o.ok) setOverdue(o.rows.length); else setError(o.error);
        if (n.ok) setNewCustomers(n.rows.length); else setError(n.error);
        if (d.ok) setCrmDecisions(d.items.length); else setError(d.error);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div
      onClick={() => navigate('/crm?tab=dashboard')}
      style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}
    >
      {error ? (
        <span style={{ fontSize: 12.5, color: RED }}>读取失败:{error}</span>
      ) : (
        <>
          <Stat label="今日需跟进" value={today} color={colors.textPrimary} />
          <Stat label="已逾期" value={overdue} color={RED} />
          <Stat label="7天新客户" value={newCustomers} color={BLUE} />
          <Stat label="CRM 待处理" value={crmDecisions} color={GREEN} />
          <span style={{ marginLeft: 'auto', fontSize: 11, color: MUTED }}>进入 CRM →</span>
        </>
      )}
    </div>
  );
}
