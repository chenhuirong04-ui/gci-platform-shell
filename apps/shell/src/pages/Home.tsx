import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { BusinessAssistantEntry } from '../components/BusinessAssistantEntry';
import { HomeKpiRow } from '../components/HomeKpiRow';
import { HomeDashboardCharts } from '../components/HomeDashboardCharts';
import { HomeDailyBrief } from '../components/HomeDailyBrief';

// ─── Helper components ──────────────────────────────────────────────────────
function getGreetingKey(hour: number) {
  if (hour < 5) return 'night' as const;
  if (hour < 11) return 'morning' as const;
  if (hour < 14) return 'noon' as const;
  if (hour < 18) return 'afternoon' as const;
  return 'evening' as const;
}

// ─── Main component ─────────────────────────────────────────────────────────
// GCI Home — Final Scope Cut: Home only answers "what do I need to manage
// today". Kept: GIA entry, the 4-KPI row, the real 7-day trend chart, the
// Daily Business Brief (incl. its own "建议今天先做" block), and the
// business-structure chart ONLY if/when a reliable real-business data
// source exists (it doesn't today — see HomeDashboardCharts.tsx's own
// comment on why that card was removed). Moved OFF Home entirely: Business
// Overview (BusinessLinesOverview + CRM/quotation/order/inventory stat
// tiles — all real modules with their own pages, duplicated here) and
// External Agents (MIA/Chanya/Growth Agent technical status) — neither
// answers "what do I manage today", both are src of the module-duplication
// Chris flagged. onFlash is now unused by Home itself (it only existed for
// the removed stat-tile/module-shortcut clicks) but stays in the prop
// signature since App.tsx's <Route> still passes it — removing it there
// is out of this fix's scope.
export function Home({ onFlash: _onFlash }: { onFlash: (msg: string) => void }) {
  const { dict, lang } = useI18n();
  const greeting = dict.greeting[getGreetingKey(new Date().getHours())];
  const greetingLine = lang === 'zh' ? `${greeting}，Chris` : `${greeting}, Chris`;

  // Task 13: KPI row below already covers 今日客户跟进/逾期事项/等你决定/待执行
  // with the live Supabase numbers. dict.workspace.summary is a static
  // placeholder string from the original design mock ("今天有 2 件逾期事项、1
  // 份报价待发送...") — real-looking numbers that are NOT live data, so it
  // must never be rendered. This line stays a plain, number-free greeting.
  const summaryLine = lang === 'zh' ? '以下是今日经营状况总览。' : "Here's today's business overview.";

  return (
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 60px' }}>
      <div style={{ marginBottom: 50 }}>
        <h1
          style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          {greetingLine}
        </h1>
        <p style={{ fontSize: 15.5, color: '#7A8494', marginTop: 12, lineHeight: 1.6, maxWidth: 620 }}>
          {summaryLine}
        </p>
      </div>

      {/* A — Business Assistant: the one primary chat entry point on Home (Task 12/13) */}
      <BusinessAssistantEntry />

      {/* B — Executive KPI: 我的事项 / 需要我决定 / 重要消息 / 新业务机会 */}
      <HomeKpiRow />

      {/* C — real 7-day business trend (business-structure chart removed — no reliable real-business data source, see HomeDashboardCharts.tsx) */}
      <HomeDashboardCharts />

      {/* D — Daily Business Brief (Task 15): deduped across CRM/Quotation/Commitments/Decisions/Calendar, max 5, incl. "建议今天先做" */}
      <HomeDailyBrief />
    </div>
  );
}
