import { useEffect, useState } from 'react';
import { StatCard, colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { statCardSpecs } from '../data/mock';
import { InventoryAlertDrawer } from '../components/InventoryAlertDrawer';
import { BusinessAssistantEntry } from '../components/BusinessAssistantEntry';
import { BusinessLinesOverview } from '../components/BusinessLinesOverview';
import { AgentsStatusCompact } from '../components/AgentsStatusCompact';
import { HomeKpiRow } from '../components/HomeKpiRow';
import { HomeDashboardCharts } from '../components/HomeDashboardCharts';
import { HomeTopPriorities } from '../components/HomeTopPriorities';
import { getAllCustomerNames } from '../lib/crmSupabase';

// ─── localStorage helpers (same keys the Trade + CRM modules use) ──────────
function safeLocalGet<T = any>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') || []; }
  catch { return []; }
}

// ─── Active follow-up filter — mirrors buildDashboardStats exactly ──────────
// Any change here must also be reflected in dashboardStats.ts FOLLOWUP_EXCLUDED.
const FOLLOWUP_EXCLUDED = ['暂缓', '已成交', '已归档', '已关闭', '执行中'];

function isActiveFollowup(t: any, today: string): boolean {
  if (!t?.nextFollowUpAt) return false;
  if (t.nextFollowUpAt.slice(0, 10) > today) return false;
  if (t?.status === 'archived' || t?.status === 'deleted' || t?.status === 'completed') return false;
  if (FOLLOWUP_EXCLUDED.includes(t?.tradeStatus || '')) return false;
  if (t?.notionSource === 'contact_only') return false;
  return true;
}

// ─── Derived counts from real data ─────────────────────────────────────────
function loadHomeStats() {
  const today = new Date().toISOString().split('T')[0];

  // CRM: active follow-ups due today (same definition as CRM dashboard + DailyWorkbench)
  const crmTasks: any[] = safeLocalGet('ICARE_HISTORY_V1');
  const followUpsToday = crmTasks.filter(t => isActiveFollowup(t, today)).length;

  // Trade: non-terminal quotes
  const quotes: any[] = safeLocalGet('quotes');
  const pendingQuotes = quotes.filter(q =>
    q?.status && q.status !== 'CONVERTED' && q.status !== 'LOST'
  ).length;

  // Trade: non-terminal orders
  const orders: any[] = safeLocalGet('orders');
  const activeOrders = orders.filter(o =>
    o?.status && o.status !== 'PAID' && o.status !== 'VOIDED'
  ).length;

  // Inventory: returned separately via API fetch (see useEffect below)
  return { followUpsToday, pendingQuotes, activeOrders, inventoryAlerts: null };
}

// ─── Helper components ──────────────────────────────────────────────────────
function getGreetingKey(hour: number) {
  if (hour < 5) return 'night' as const;
  if (hour < 11) return 'morning' as const;
  if (hour < 14) return 'noon' as const;
  if (hour < 18) return 'afternoon' as const;
  return 'evening' as const;
}

function SectionHeader({ label, trailing }: { label: string; trailing?: string }) {
  return (
    <div className="flex items-center" style={{ gap: 14, marginBottom: 20 }}>
      <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: colors.goldBase }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),rgba(203,168,92,0))' }} />
      {trailing && (
        <span className="font-mono-label" style={{ fontSize: 10.5, color: '#505A70' }}>
          {trailing}
        </span>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export function Home({ onFlash }: { onFlash: (msg: string) => void }) {
  const { dict, lang } = useI18n();
  const greeting = dict.greeting[getGreetingKey(new Date().getHours())];
  const greetingLine = lang === 'zh' ? `${greeting}，Chris` : `${greeting}, Chris`;

  const [stats, setStats] = useState<{
    followUpsToday: number | null;
    pendingQuotes: number | null;
    activeOrders: number | null;
    inventoryAlerts: number | null;
  }>({ followUpsToday: null, pendingQuotes: null, activeOrders: null, inventoryAlerts: null });

  const [inventoryDrawerOpen, setInventoryDrawerOpen] = useState(false);
  const [crmTotal, setCrmTotal] = useState<number | null>(null);

  useEffect(() => {
    const s = loadHomeStats();
    setStats(s);
    getAllCustomerNames().then((res) => { if (res.ok) setCrmTotal(res.rows.length); });

    // Fetch combined inventory alert count: warehouse (Notion) + consignment (Supabase)
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    Promise.allSettled([
      fetch(`${base}/api/ai/inventory-table-alerts`).then(r => r.json()),
      fetch(`${base}/api/trade/check-inventory`).then(r => r.json()),
    ]).then(([whResult, csResult]) => {
      const whCount = whResult.status === 'fulfilled' && whResult.value.ok ? (whResult.value.alertCount ?? 0) : 0;
      const csCount = csResult.status === 'fulfilled' && csResult.value.ok ? (csResult.value.alertCount ?? 0) : 0;
      setStats(prev => ({ ...prev, inventoryAlerts: whCount + csCount }));
    }).catch(() => {
      // Silent fail — card shows '--' if APIs unavailable
    });
  }, []);

  // Task 13: KPI row below already covers 今日客户跟进/逾期事项/等你决定/待执行
  // with the live Supabase numbers. dict.workspace.summary is a static
  // placeholder string from the original design mock ("今天有 2 件逾期事项、1
  // 份报价待发送...") — real-looking numbers that are NOT live data, so it
  // must never be rendered. This line stays a plain, number-free greeting.
  const summaryLine = lang === 'zh' ? '以下是今日经营状况总览。' : "Here's today's business overview.";

  // Overlay real counts on the statCardSpecs visual configs (报价/订单/库存
  // only — index 0 "followUpsToday" is dropped here since it duplicates the
  // KPI row's "今日客户跟进").
  const statCards = [
    { ...statCardSpecs[1], val: stats.pendingQuotes  !== null ? String(stats.pendingQuotes)  : '--', mod: dict.workspace.modQuotation },
    { ...statCardSpecs[2], val: stats.activeOrders   !== null ? String(stats.activeOrders)   : '--', mod: dict.workspace.modTrade },
    { ...statCardSpecs[3], val: stats.inventoryAlerts !== null ? String(stats.inventoryAlerts) : '--', mod: dict.workspace.modInventory },
  ];

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

      {/* B — Executive KPI: 6 compact numbers, each backed by an existing Task 4/7/8/9/5.2 read */}
      <HomeKpiRow />

      {/* C — Business Charts: real 7-day trend + real P1/P2/P3 backlog structure */}
      <HomeDashboardCharts />

      {/* D — Top 3 priorities only (not top 5/20), email source excluded — see HomeTopPriorities.tsx */}
      <HomeTopPriorities />

      {/* E — Business Overview: all business lines (crm_customers.business_type) + core operating metrics */}
      <SectionHeader label="经营概览 · BUSINESS OVERVIEW" />
      <div style={{ marginBottom: 16 }}>
        <BusinessLinesOverview />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 44 }}>
        <div
          onClick={() => onFlash(dict.toast.enterModule(dict.workspace.modCrm))}
          style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, cursor: 'pointer', textAlign: 'center' }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{crmTotal === null ? '—' : crmTotal}</div>
          <div style={{ fontSize: 10.5, color: '#7A8494', marginTop: 4 }}>CRM 客户</div>
        </div>
        {statCards.map((f, i) => (
          <StatCard
            key={i}
            data={{ ...f, label: dict.facts[f.labelKey] }}
            onClick={
              f.labelKey === 'inventoryAlerts'
                ? () => setInventoryDrawerOpen(true)
                : () => onFlash(dict.toast.enterModule(f.mod))
            }
          />
        ))}
      </div>

      {/* F — External Agents: MIA / E-commerce Assistant / Growth Agent — light summary only */}
      <SectionHeader label="EXTERNAL AGENTS · 外部 AI 员工" />
      <AgentsStatusCompact />

      {/* Inventory alert drawer */}
      {inventoryDrawerOpen && (
        <InventoryAlertDrawer onClose={() => setInventoryDrawerOpen(false)} />
      )}
    </div>
  );
}
