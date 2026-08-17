// GCI Executive Desk — Task 13: Business Overview / 所有业务方向.
// Groups existing crm_customers by the existing business_type column —
// no new table, no guessed classification. A customer with no matching
// business_type is counted as UNKNOWN, never silently assigned a line.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getBusinessLineBreakdown, type BusinessLineCount } from '../lib/crmSupabase';

const GOLD = '#CBA85C';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function LineTile({ line, count }: { line: string; count: number }) {
  return (
    <div style={{ padding: '12px 14px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? colors.textPrimary : MUTED, fontFamily: "'Space Grotesk',sans-serif" }}>{count}</div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{line}</div>
    </div>
  );
}

export function BusinessLinesOverview() {
  const navigate = useNavigate();
  const [lines, setLines] = useState<BusinessLineCount[] | null>(null);
  const [unknown, setUnknown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessLineBreakdown().then((res) => {
      if (res.ok) { setLines(res.lines); setUnknown(res.unknown); }
      else setError(res.error);
    });
  }, []);

  return (
    <div onClick={() => navigate('/crm?tab=dashboard')} style={{ cursor: 'pointer' }}>
      {error ? (
        <div style={{ fontSize: 12.5, color: '#E0846A', padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>读取失败:{error}</div>
      ) : !lines ? (
        <div style={{ fontSize: 12.5, color: MUTED, padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>加载中…</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
          {lines.map((l) => <LineTile key={l.line} line={l.line} count={l.count} />)}
          <LineTile line="UNKNOWN / 未分类" count={unknown ?? 0} />
        </div>
      )}
    </div>
  );
}
