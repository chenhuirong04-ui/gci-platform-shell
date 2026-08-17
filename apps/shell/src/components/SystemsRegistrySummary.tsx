// GCI Executive Desk — Task 6: small "Systems / 开发资产" summary entry.
// Read-only. Clicking navigates to the full list (/systems).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getSystemRegistry, summarize, type SystemRegistrySummary } from '../lib/systemRegistry';

const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

export function SystemsRegistrySummaryCard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SystemRegistrySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSystemRegistry().then((res) => {
      if (res.ok) setSummary(summarize(res.rows));
      else setError(res.error);
    });
  }, []);

  return (
    <div
      onClick={() => navigate('/systems')}
      style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}
    >
      {error ? (
        <span style={{ fontSize: 12.5, color: '#E0846A' }}>读取失败:{error}</span>
      ) : !summary ? (
        <span style={{ fontSize: 12.5, color: MUTED }}>加载中…</span>
      ) : (
        <>
          <Stat label="系统数量" value={summary.total} />
          <Stat label="Production" value={summary.production} />
          <Stat label="Development" value={summary.development} />
          <Stat label="Legacy / Unknown" value={summary.legacyOrUnknown} />
          <Stat label="待审计" value={summary.needsReview} />
          <span style={{ marginLeft: 'auto', fontSize: 11, color: MUTED }}>查看列表 →</span>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: MUTED }}>{label}</div>
    </div>
  );
}
