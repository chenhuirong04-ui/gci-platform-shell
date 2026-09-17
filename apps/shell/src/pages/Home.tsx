import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { useAuth } from '../contexts/AuthContext';
import { InventoryAlertDrawer } from '../components/InventoryAlertDrawer';
import { BusinessAssistantEntry } from '../components/BusinessAssistantEntry';
import {
  loadTodoToday, loadMoneyToday, loadBusinessToday, loadAnomalies, loadDocumentExpiryAlerts,
  type TodoTodayStats, type MoneyTodayStats, type BusinessTodayStats, type AnomalyStats,
  type DocumentExpiryAlert,
} from '../lib/dailyWorkspaceStats';

// ─── Daily Workspace rebuild (2026-09-16) ───────────────────────────────────
// Every tile below reads from dailyWorkspaceStats.ts, which only ever
// touches real, already-live tables/services — no Mock, no new API. A tile
// whose source has nothing to report (or whose fetch failed) shows "暂无
// 数据", never a fake 0 (see chat report for the full data-source audit).
// Removed from Home entirely this round (per explicit instruction, not
// deleted — still reachable elsewhere):
//   - BusinessLinesOverview (25H/AI, Trade, Workforce, Ecommerce, Other,
//     UNKNOWN cards) — already reachable at /crm?tab=dashboard, its own
//     onClick target; not re-added anywhere else since that would touch
//     the CRM module, out of this round's scope ("不改其他模块").
//   - HomeKpiRow — its 4 tiles are superseded by section 1 below (which
//     adds 逾期事项/今日客户跟进 using the same real sources, and drops the
//     two fields that used to be a hardcoded 0: 重要消息 had no data source
//     at all — dropped rather than faked; 新业务机会 moved into section 3
//     as a real query instead of a static placeholder).
//   - HomeDashboardCharts (7-day activity trend) — not part of the 5-section
//     structure this round's instruction defines; not deleted.
//
// Permission-aware rebuild (2026-09-16, second revision) — reuses the SAME
// module system every other page already gates on (AuthContext.can(),
// user_profiles.modules[] — see ProtectedRoute.tsx), no second permission
// system. Each tile below optionally names the module it needs; a tile
// whose module the user doesn't have is REMOVED from its array entirely
// (never rendered as a disabled/greyed/"无权限查看" placeholder, and never
// shown as a misleading 0 — see the isZh/hasValue Tile logic). Tiles with
// no `module` (tasks/decisions/company documents/GIA — already unrestricted
// platform-level pages per Sidebar.tsx's own MODULE_PATH_MAP convention)
// stay visible to everyone. "Chris 和 LILI 是 full-access" is a DATA fact
// (their user_profiles.modules already lists every module), not something
// this component special-cases by name — can() already returns true for
// every check once a profile has every module key, so full access for them
// falls out of the existing system for free.
const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const BLUE = '#8FA6D4';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function getGreetingKey(hour: number) {
  if (hour < 5) return 'night' as const;
  if (hour < 11) return 'morning' as const;
  if (hour < 14) return 'noon' as const;
  if (hour < 18) return 'afternoon' as const;
  return 'evening' as const;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center" style={{ gap: 14, marginBottom: 16 }}>
      <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: colors.goldBase }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),rgba(203,168,92,0))' }} />
    </div>
  );
}

type TileValue = number | null;

interface TileSpec {
  key: string;
  label: string;
  value: TileValue;
  color?: string;
  money?: boolean;
  onClick?: () => void;
  /** Module key required to see this tile (AuthContext.can()) — omit for
   * platform-level tiles unrestricted to any authenticated user. */
  module?: string;
}

/** loading=true shows "…"; loading=false + value=null shows "暂无数据" — the
 * two are never conflated, so a genuinely-empty real answer (e.g. 0
 * unreconciled bank lines) is never confused with "hasn't loaded yet". */
function Tile({ t, loading, isZh }: { t: TileSpec; loading: boolean; isZh: boolean }) {
  const hasValue = t.value !== null;
  const display = loading ? '…' : !hasValue ? (isZh ? '暂无数据' : 'No data') : t.money ? `${t.value!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(t.value);
  const clickable = !!t.onClick && hasValue;
  return (
    <div
      onClick={clickable ? t.onClick : undefined}
      style={{
        padding: '16px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12,
        cursor: clickable ? 'pointer' : 'default', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: !hasValue || loading ? 14 : t.money ? 18 : 24, fontWeight: 700, color: hasValue && !loading ? (t.color || colors.textPrimary) : MUTED, fontFamily: "'Space Grotesk',sans-serif" }}>
        {display}
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{t.label}</div>
    </div>
  );
}

function TileGrid({ tiles, loading, isZh }: { tiles: TileSpec[]; loading: boolean; isZh: boolean }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${tiles.length},1fr)`, gap: 12, marginBottom: 44 }}>
      {tiles.map((t) => <Tile key={t.key} t={t} loading={loading} isZh={isZh} />)}
    </div>
  );
}

export function Home({ onFlash: _onFlash }: { onFlash: (msg: string) => void }) {
  const navigate = useNavigate();
  const { dict, lang } = useI18n();
  const { can, profileLoading } = useAuth();
  const isZh = lang === 'zh';
  // Permission is either not-yet-determined (profileLoading) or determined
  // — never filter tiles on a stale/default `can()` result, which would
  // flash-hide a tile the user actually has access to. While not yet
  // determined, every section's own data-loading state (below) is also
  // still true anyway, so this never causes an extra visible delay.
  const permReady = !profileLoading;
  const visible = (module?: string) => !module || !permReady || can(module);
  const greeting = dict.greeting[getGreetingKey(new Date().getHours())];
  const greetingLine = isZh ? `${greeting}，Chris` : `${greeting}, Chris`;
  const summaryLine = isZh ? '以下是今日经营状况总览。' : "Here's today's business overview.";

  const [todo, setTodo] = useState<TodoTodayStats | null>(null);
  const [money, setMoney] = useState<MoneyTodayStats | null>(null);
  const [business, setBusiness] = useState<BusinessTodayStats | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyStats | null>(null);
  const [docExpiry, setDocExpiry] = useState<{ count: number; items: DocumentExpiryAlert[] } | null>(null);
  const [inventoryDrawerOpen, setInventoryDrawerOpen] = useState(false);

  useEffect(() => {
    loadTodoToday().then(setTodo);
    loadMoneyToday().then(setMoney);
    loadBusinessToday().then(setBusiness);
    loadAnomalies().then(setAnomalies);
    loadDocumentExpiryAlerts().then(setDocExpiry);
  }, []);

  const todoTiles: TileSpec[] = [
    { key: 'myTasks', label: isZh ? '我的事项' : 'My Tasks', value: todo?.myTasks ?? null, color: GOLD, onClick: () => navigate('/tasks') },
    { key: 'needsDecision', label: isZh ? '需要我决定' : 'Needs My Decision', value: todo?.needsDecision ?? null, color: RED, onClick: () => navigate('/decisions') },
    { key: 'overdueTasks', label: isZh ? '逾期事项' : 'Overdue Tasks', value: todo?.overdueTasks ?? null, color: RED, onClick: () => navigate('/tasks') },
    { key: 'todayFollowups', label: isZh ? '今日客户跟进' : "Today's Follow-ups", value: todo?.todayFollowups ?? null, color: BLUE, onClick: () => navigate('/crm-customers'), module: 'crm' },
  ].filter((t) => visible(t.module));

  const moneyTiles: TileSpec[] = [
    { key: 'bankBalance', label: isZh ? '当前银行余额' : 'Bank Balance', value: money?.bankBalance ?? null, money: true, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'monthInflow', label: isZh ? '本月经营现金流入' : 'Operating Inflow (MTD)', value: money?.monthInflow ?? null, color: GREEN, money: true, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'monthOutflow', label: isZh ? '本月经营现金流出' : 'Operating Outflow (MTD)', value: money?.monthOutflow ?? null, color: RED, money: true, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'ar', label: isZh ? 'AR / 应收' : 'AR / Receivable', value: money?.ar ?? null, money: true, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'ap', label: isZh ? 'AP / 应付' : 'AP / Payable', value: money?.ap ?? null, money: true, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
  ].filter((t) => visible(t.module));

  const businessTiles: TileSpec[] = [
    { key: 'followUpBacklog', label: isZh ? '待跟进客户' : 'Follow-up Backlog', value: business?.followUpBacklog ?? null, color: GOLD, onClick: () => navigate('/crm-customers'), module: 'crm' },
    { key: 'pendingQuotes', label: isZh ? '待完成报价' : 'Pending Quotes', value: business?.pendingQuotes ?? null, color: BLUE, onClick: () => navigate('/quotation'), module: 'quotation' },
    { key: 'activeOrders', label: isZh ? '执行中订单' : 'Active Orders', value: business?.activeOrders ?? null, color: GREEN, onClick: () => navigate('/trade'), module: 'trade' },
    { key: 'newOpportunities', label: isZh ? '新业务机会' : 'New Opportunities', value: business?.newOpportunities ?? null, color: GOLD, onClick: () => navigate('/mia-leads') },
  ].filter((t) => visible(t.module));

  const anomalyTiles: TileSpec[] = [
    { key: 'inventoryAlerts', label: isZh ? '库存预警' : 'Inventory Alerts', value: anomalies?.inventoryAlerts ?? null, color: RED, onClick: () => setInventoryDrawerOpen(true), module: 'warehouse' },
    { key: 'unreconciledBankLines', label: isZh ? '未对账银行流水' : 'Unreconciled Bank Lines', value: anomalies?.unreconciledBankLines ?? null, color: RED, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'missingVouchers', label: isZh ? '缺凭证' : 'Missing Vouchers', value: anomalies?.missingVouchers ?? null, color: RED, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'overdueAR', label: isZh ? '逾期应收' : 'Overdue AR', value: anomalies?.overdueAR ?? null, color: RED, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'overdueAP', label: isZh ? '逾期应付' : 'Overdue AP', value: anomalies?.overdueAP ?? null, color: RED, onClick: () => navigate('/trade?tab=finance-center'), module: 'finance' },
    { key: 'documentExpiry', label: isZh ? '证件到期提醒' : 'Document Expiry', value: docExpiry?.count ?? null, color: RED, onClick: () => navigate('/company-documents') },
  ].filter((t) => visible(t.module));

  const DOC_RISK_LABEL: Record<DocumentExpiryAlert['risk'], string> = {
    expired: isZh ? '已过期' : 'Expired',
    urgent: isZh ? '紧急' : 'Urgent',
    high: isZh ? '高' : 'High',
    reminder: isZh ? '提醒' : 'Reminder',
    early: isZh ? '提前提醒' : 'Early Reminder',
    warning: isZh ? '预警' : 'Watch',
  };
  const DOC_RISK_COLOR: Record<DocumentExpiryAlert['risk'], string> = {
    expired: RED, urgent: RED, high: RED, reminder: GOLD, early: GOLD, warning: BLUE,
  };

  return (
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 60px' }}>
      <div style={{ marginBottom: 50 }}>
        <h1
          style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 34, fontWeight: 600,
            letterSpacing: '-0.01em', lineHeight: 1.1, color: colors.textPrimary, margin: 0,
          }}
        >
          {greetingLine}
        </h1>
        <p style={{ fontSize: 15.5, color: '#7A8494', marginTop: 12, lineHeight: 1.6, maxWidth: 620 }}>
          {summaryLine}
        </p>
      </div>

      {/* Each section is dropped entirely (header included) when permission
          filtering leaves zero tiles — never an empty header over nothing,
          and never a "no permission" placeholder in its place. */}
      {todoTiles.length > 0 && (<>
        <SectionHeader label={isZh ? '今天要处理' : "TODAY'S TO-DO"} />
        <TileGrid tiles={todoTiles} loading={!todo} isZh={isZh} />
      </>)}

      {moneyTiles.length > 0 && (<>
        <SectionHeader label={isZh ? '今天的钱' : "TODAY'S MONEY"} />
        <TileGrid tiles={moneyTiles} loading={!money} isZh={isZh} />
      </>)}

      {businessTiles.length > 0 && (<>
        <SectionHeader label={isZh ? '今天的业务' : "TODAY'S BUSINESS"} />
        <TileGrid tiles={businessTiles} loading={!business} isZh={isZh} />
      </>)}

      {anomalyTiles.length > 0 && (<>
        <SectionHeader label={isZh ? '异常提醒' : 'ALERTS'} />
        <TileGrid tiles={anomalyTiles} loading={!anomalies} isZh={isZh} />
      </>)}

      {docExpiry && docExpiry.items.length > 0 && (
        <div style={{ marginTop: -12, marginBottom: 32 }}>
          {docExpiry.items.slice(0, 5).map((item) => (
            <div
              key={item.id}
              onClick={() => navigate('/company-documents')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', marginTop: 6,
                borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: colors.textPrimary,
                background: 'rgba(255,255,255,0.025)', border: `1px solid rgba(255,255,255,0.07)`,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: DOC_RISK_COLOR[item.risk], padding: '2px 8px', borderRadius: 20, background: `${DOC_RISK_COLOR[item.risk]}1A`, flexShrink: 0 }}>
                {DOC_RISK_LABEL[item.risk]}
              </span>
              <span style={{ flex: 1 }}>
                {item.companyName ? `${item.companyName} ` : ''}{item.documentType}
                {isZh ? ' 将于 ' : ' expires '}{item.expiryDate}{isZh ? ' 到期' : ''}
                {isZh
                  ? `，${item.daysRemaining >= 0 ? `剩余 ${item.daysRemaining} 天` : `已过期 ${Math.abs(item.daysRemaining)} 天`}`
                  : ` (${item.daysRemaining >= 0 ? `${item.daysRemaining} days left` : `${Math.abs(item.daysRemaining)} days overdue`})`}
              </span>
            </div>
          ))}
          {docExpiry.items.length > 5 && (
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, paddingLeft: 4 }}>
              {isZh ? `还有 ${docExpiry.items.length - 5} 项，前往公司文件查看全部` : `${docExpiry.items.length - 5} more — view all in Company Documents`}
            </div>
          )}
        </div>
      )}

      {/* Ask GCI — the one search/assistant entry point, listed last per the
          final structure. Its own shortcut chips were trimmed to only
          real, working actions (查客户/查报价/查文件/查财务/记录跟进) — see
          BusinessAssistantEntry.tsx. */}
      <SectionHeader label="ASK GCI" />
      <BusinessAssistantEntry />

      {inventoryDrawerOpen && (
        <InventoryAlertDrawer onClose={() => setInventoryDrawerOpen(false)} />
      )}
    </div>
  );
}
