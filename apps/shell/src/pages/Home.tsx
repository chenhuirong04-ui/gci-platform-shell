import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCard, AlertRow, QuickActionCard, colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { statCardSpecs } from '../data/mock';
import { AIWorkspace } from '../components/AIWorkspace';
import { InventoryAlertDrawer } from '../components/InventoryAlertDrawer';

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

// ─── Priority alerts from real data ────────────────────────────────────────
interface LiveAlert {
  dot: string;
  text: string;
  ref: string;
  src: string;
  sc: string;
  sb: string;
  action: string;
  path: string;
}

function loadLiveAlerts(lang: 'zh' | 'en'): LiveAlert[] {
  const today = new Date().toISOString().split('T')[0];
  const alerts: LiveAlert[] = [];

  // 1. Overdue CRM follow-ups (top 2) — same active filter as loadHomeStats
  const crmTasks: any[] = safeLocalGet('ICARE_HISTORY_V1');
  const overdueFollowups = crmTasks
    .filter(t =>
      isActiveFollowup(t, today) &&
      t.nextFollowUpAt.slice(0, 10) < today &&
      t?.clientName
    )
    .sort((a, b) => a.nextFollowUpAt.localeCompare(b.nextFollowUpAt))
    .slice(0, 2);

  for (const t of overdueFollowups) {
    const overdueDays = Math.round(
      (new Date(today).getTime() - new Date(t.nextFollowUpAt.slice(0, 10)).getTime()) / 86400000
    );
    alerts.push({
      dot: '#E0846A',
      text: lang === 'zh'
        ? `${t.clientName} — 跟进已逾期 ${overdueDays} 天`
        : `${t.clientName} — follow-up overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}`,
      ref: t.id ? t.id.slice(0, 16) : '',
      src: 'CRM',
      sc: '#8FA6D4',
      sb: 'rgba(143,166,212,0.14)',
      action: lang === 'zh' ? '跟进' : 'Follow up',
      path: '/crm?tab=dashboard',
    });
  }

  // 2. Quoted orders waiting > 3 days (top 1)
  const quotes: any[] = safeLocalGet('quotes');
  const stalequote = quotes
    .filter(q => q?.status === 'QUOTED' && q?.createdAt)
    .map(q => ({
      ...q,
      age: Math.round((Date.now() - new Date(q.createdAt).getTime()) / 86400000),
    }))
    .filter(q => q.age >= 3)
    .sort((a, b) => b.age - a.age)[0];

  if (stalequote) {
    const total = stalequote.grandTotal ? `AED ${Number(stalequote.grandTotal).toLocaleString()}` : '';
    alerts.push({
      dot: '#D4A843',
      text: lang === 'zh'
        ? `${stalequote.clientName || stalequote.client || '客户'} — 报价已发出 ${stalequote.age} 天未回复`
        : `${stalequote.clientName || stalequote.client || 'Client'} — quote sent ${stalequote.age} days ago, no reply`,
      ref: [stalequote.docNo || stalequote.id?.slice(0, 12), total].filter(Boolean).join(' · '),
      src: 'QUOTATION',
      sc: '#D4A843',
      sb: 'rgba(212,168,67,0.12)',
      action: lang === 'zh' ? '查看' : 'View',
      path: '/trade?tab=history',
    });
  }

  // 3. Orders close to due date (within 5 days) (top 1)
  const orders: any[] = safeLocalGet('orders');
  const urgentOrder = orders
    .filter(o => o?.status !== 'PAID' && o?.status !== 'VOIDED' && o?.dueDate)
    .map(o => ({
      ...o,
      daysLeft: Math.round((new Date(o.dueDate).getTime() - Date.now()) / 86400000),
    }))
    .filter(o => o.daysLeft >= 0 && o.daysLeft <= 5)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];

  if (urgentOrder) {
    alerts.push({
      dot: '#D4A843',
      text: lang === 'zh'
        ? `${urgentOrder.clientName || urgentOrder.client || '订单'} — 交期还有 ${urgentOrder.daysLeft} 天`
        : `${urgentOrder.clientName || urgentOrder.client || 'Order'} — due in ${urgentOrder.daysLeft} day${urgentOrder.daysLeft !== 1 ? 's' : ''}`,
      ref: [urgentOrder.docNo || urgentOrder.id?.slice(0, 12), urgentOrder.dueDate].filter(Boolean).join(' · '),
      src: 'TRADE',
      sc: '#8FA6D4',
      sb: 'rgba(143,166,212,0.14)',
      action: lang === 'zh' ? '确认' : 'Check',
      path: '/trade?tab=history',
    });
  }

  return alerts.slice(0, 3);
}

// ─── Quick Actions config (with real navigation paths) ─────────────────────
const QUICK_ACTIONS = [
  {
    labelKey: 'addClient' as const,
    icon: '+',
    ib: 'linear-gradient(135deg,rgba(203,168,92,0.2),rgba(203,168,92,0.08))',
    ic: '#E2C988',
    is: '0 4px 16px rgba(203,168,92,0.2)',
    path: '/crm?tab=dashboard',
  },
  {
    labelKey: 'createQuote' as const,
    icon: '＄',
    ib: 'rgba(255,255,255,0.05)',
    ic: '#C8BDA8',
    is: 'none',
    path: '/quotation?mode=customer-quote',
  },
  {
    labelKey: 'uploadBoq' as const,
    icon: '↑',
    ib: 'rgba(255,255,255,0.05)',
    ic: '#C8BDA8',
    is: 'none',
    path: '/quotation?mode=customer-quote',
  },
  {
    labelKey: 'createOrder' as const,
    icon: '▣',
    ib: 'rgba(255,255,255,0.05)',
    ic: '#C8BDA8',
    is: 'none',
    path: '/trade?tab=quote',
  },
];

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
  const navigate = useNavigate();
  const greeting = dict.greeting[getGreetingKey(new Date().getHours())];
  const greetingLine = lang === 'zh' ? `${greeting}，Chris` : `${greeting}, Chris`;

  const [stats, setStats] = useState<{
    followUpsToday: number | null;
    pendingQuotes: number | null;
    activeOrders: number | null;
    inventoryAlerts: number | null;
  }>({ followUpsToday: null, pendingQuotes: null, activeOrders: null, inventoryAlerts: null });

  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[] | null>(null);
  const [inventoryDrawerOpen, setInventoryDrawerOpen] = useState(false);

  useEffect(() => {
    const s = loadHomeStats();
    setStats(s);
    setLiveAlerts(loadLiveAlerts(lang));

    // Fetch real inventory alert count from API (缺货 + 低库存 + 数据异常)
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    fetch(`${base}/api/trade/check-inventory`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setStats(prev => ({ ...prev, inventoryAlerts: data.alertCount ?? data.lowStockCount ?? 0 }));
        }
      })
      .catch(() => {
        // Silent fail — card shows '--' if API unavailable
      });
  }, [lang]);

  // Dynamic summary line based on real counts
  function buildSummary() {
    const { followUpsToday, pendingQuotes, activeOrders } = stats;
    // If all null = data not yet loaded, fall back to generic
    if (followUpsToday === null) return dict.workspace.summary;
    const parts: string[] = [];
    if (followUpsToday > 0) parts.push(lang === 'zh' ? `${followUpsToday} 件跟进待处理` : `${followUpsToday} follow-up${followUpsToday !== 1 ? 's' : ''} due`);
    if (pendingQuotes && pendingQuotes > 0) parts.push(lang === 'zh' ? `${pendingQuotes} 份报价进行中` : `${pendingQuotes} quote${pendingQuotes !== 1 ? 's' : ''} in progress`);
    if (activeOrders && activeOrders > 0) parts.push(lang === 'zh' ? `${activeOrders} 个订单执行中` : `${activeOrders} active order${activeOrders !== 1 ? 's' : ''}`);
    if (parts.length === 0) return lang === 'zh' ? '今日暂无待处理事项，保持跟进节奏。' : 'No urgent items today. Keep up the follow-up rhythm.';
    return lang === 'zh' ? `${parts.join('、')}。处理完重点提醒后，按模块继续。` : `${parts.join(', ')}. Work through priority alerts then continue by module.`;
  }

  // Overlay real counts on the statCardSpecs visual configs
  // mod eyebrow is translated via dict.workspace.*
  const statCards = [
    { ...statCardSpecs[0], val: stats.followUpsToday !== null ? String(stats.followUpsToday) : '--', mod: dict.workspace.modCrm },
    { ...statCardSpecs[1], val: stats.pendingQuotes  !== null ? String(stats.pendingQuotes)  : '--', mod: dict.workspace.modQuotation },
    { ...statCardSpecs[2], val: stats.activeOrders   !== null ? String(stats.activeOrders)   : '--', mod: dict.workspace.modTrade },
    { ...statCardSpecs[3], val: stats.inventoryAlerts !== null ? String(stats.inventoryAlerts) : '--', mod: dict.workspace.modInventory },
  ];

  const alertsToShow = liveAlerts ?? [];

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
          {buildSummary()}
        </p>
      </div>

      {/* AI WORKSPACE */}
      <AIWorkspace />

      {/* TODAY stats */}
      <SectionHeader label={dict.workspace.today} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 52 }}>
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

      {/* Inventory alert drawer */}
      {inventoryDrawerOpen && (
        <InventoryAlertDrawer onClose={() => setInventoryDrawerOpen(false)} />
      )}

      {/* PRIORITY ALERTS */}
      <SectionHeader
        label={dict.workspace.priorityAlerts}
        trailing={alertsToShow.length > 0 ? `${alertsToShow.length} ${dict.workspace.items}` : undefined}
      />
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.065)',
          borderRadius: 16,
          overflow: 'hidden',
          marginBottom: 52,
          backdropFilter: 'blur(4px)',
        }}
      >
        {alertsToShow.length === 0 ? (
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3A4255', letterSpacing: '0.05em' }}>
              {lang === 'zh' ? '暂无重点提醒' : 'No priority alerts'}
            </div>
            <div style={{ fontSize: 11, color: '#2A3245', marginTop: 6, fontFamily: 'IBM Plex Mono, monospace' }}>
              {lang === 'zh' ? '所有事项跟进正常' : 'All items on track'}
            </div>
          </div>
        ) : (
          alertsToShow.map((a, i) => (
            <AlertRow
              key={i}
              data={a}
              onClick={() => navigate(a.path)}
            />
          ))
        )}
      </div>

      {/* QUICK ACTIONS */}
      <SectionHeader label={dict.workspace.quickActions} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
        {QUICK_ACTIONS.map((q, i) => (
          <QuickActionCard
            key={i}
            data={{ ...q, label: dict.quickActions[q.labelKey] }}
            onClick={() => navigate(q.path)}
          />
        ))}
      </div>
    </div>
  );
}
