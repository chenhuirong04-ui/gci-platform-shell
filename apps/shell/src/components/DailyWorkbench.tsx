import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildDashboardStats } from '../../../../modules/crm/utils/dashboardStats';
import type { FollowUpTask } from '../../../../modules/crm/types';

// ── Design tokens (matching AIPage / CRM dark premium) ────────────────────────
const BG    = '#0A1628';
const CARD  = 'rgba(255,255,255,0.025)';
const CARD2 = 'rgba(255,255,255,0.045)';
const BORD  = 'rgba(255,255,255,0.07)';
const GOLD  = '#CBA85C';
const GOLD_L = '#E2C988';
const T1    = '#E8F0FF';
const T2    = '#8A97B0';
const GREEN = '#6FBF8E';
const RED   = '#E0846A';
const BLUE  = '#5BA3C9';
const NAVY  = '#080D1E';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  waiting_approval: '待审批',
  approved: '已批准',
};
const STATUS_COLOR: Record<string, string> = {
  draft: T2,
  waiting_approval: GOLD,
  approved: GREEN,
};

const TYPE_COLOR: Record<string, string> = {
  CRM: BLUE,
  报价: GOLD,
  发票: GREEN,
};

interface QuotationData {
  ok: boolean;
  total: number;
  overdueCount: number;
  overdueDays: number;
  quotes: Array<{
    id: string;
    customerName: string;
    grandTotal: number;
    currency: string;
    daysAgo: number;
    overdue: boolean;
    projectName?: string;
    quoteRef?: string;
  }>;
  asOf: string;
}

interface InvoiceData {
  ok: boolean;
  total: number;
  byStatus: Record<string, number>;
  items: Array<{
    id: string;
    invoiceNo: string;
    customerName: string;
    grandTotal: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  asOf: string;
}

interface SuggestedItem {
  key: string;
  customer: string;
  reason: string;
  action: string;
  type: 'CRM' | '报价' | '发票';
  amount?: string;
  route: string;
}

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORD}`, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T2, fontFamily: 'IBM Plex Mono,monospace', letterSpacing: '0.08em' }}>{sub}</div>}
      <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SectionHead({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 24 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: GOLD, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '0.04em' }}>{title}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10, color: T2, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace' }}>{count}</span>
      )}
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,rgba(203,168,92,0.25),transparent)` }} />
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 10, padding: '12px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

export function DailyWorkbench() {
  const navigate = useNavigate();

  // CRM data from localStorage
  const [stats, setStats] = useState<ReturnType<typeof buildDashboardStats> | null>(null);
  const [quotation, setQuotation] = useState<QuotationData | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Load CRM from localStorage (same key as CrmModule)
    try {
      const raw = localStorage.getItem('ICARE_HISTORY_V1');
      const tasks: FollowUpTask[] = raw ? JSON.parse(raw) : [];
      setStats(buildDashboardStats(tasks));
    } catch (e) {
      console.warn('[DailyWorkbench] localStorage read failed', e);
      setStats(buildDashboardStats([]));
    }

    // 2. Fetch quotation data + invoice data in parallel
    const base = window.location.origin;
    Promise.allSettled([
      fetch(`${base}/api/trade/check-quotation-followups`).then(r => r.json()),
      fetch(`${base}/api/invoice/pending-summary`).then(r => r.json()),
    ]).then(([qRes, iRes]) => {
      if (qRes.status === 'fulfilled' && qRes.value?.ok) setQuotation(qRes.value);
      if (iRes.status === 'fulfilled' && iRes.value?.ok) setInvoice(iRes.value);
      setLoading(false);
    });
  }, []);

  // ── Build AI priority suggestions ─────────────────────────────────────────
  const suggestions: SuggestedItem[] = [];

  if (stats) {
    // Urgent CRM items (already prioritised by dashboardStats)
    for (const task of stats.actionCenterGroups.urgent.slice(0, 3)) {
      const daysOverdue = task.nextFollowUpAt
        ? Math.floor((Date.now() - new Date(task.nextFollowUpAt).getTime()) / 86400000)
        : 0;
      suggestions.push({
        key: task.id,
        customer: task.clientName,
        reason: task.tradeStatus === '需求整理中'
          ? '需求整理中，已逾期'
          : task.tradeStatus === '已报价待确认'
          ? `报价${daysOverdue}天未回复`
          : `A级客户逾期${daysOverdue}天`,
        action: task.tradeStatus === '需求整理中' ? '整理需求，准备报价'
          : task.tradeStatus === '已报价待确认' ? '跟进报价确认'
          : '电话/WhatsApp 确认需求',
        type: 'CRM',
        route: '/crm?tab=followup',
      });
    }
  }

  // Overdue quotations (if not already in urgent)
  if (quotation?.quotes) {
    for (const q of quotation.quotes.filter(q => q.overdue).slice(0, 2)) {
      const already = suggestions.find(s => s.customer.toLowerCase() === q.customerName.toLowerCase());
      if (!already) {
        suggestions.push({
          key: `q_${q.id}`,
          customer: q.customerName,
          reason: `报价${q.daysAgo}天无回复`,
          action: '联系客户跟进报价状态',
          type: '报价',
          amount: `${q.currency} ${Number(q.grandTotal).toLocaleString()}`,
          route: '/quotation',
        });
      }
    }
  }

  const topSuggestions = suggestions.slice(0, 5);

  const today = new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 600, color: T1, margin: '0 0 4px' }}>今日工作台</h2>
        <div style={{ fontSize: 12, color: T2, fontFamily: 'IBM Plex Mono,monospace' }}>{today}</div>
      </div>

      {/* ── 4 Summary Cards ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 4 }}>
        <StatCard
          label="今日必须推进"
          value={loading ? '…' : (stats?.actionCenterGroups.urgent.length ?? 0)}
          color={RED}
          sub="URGENT"
        />
        <StatCard
          label="逾期事项"
          value={loading ? '…' : (stats?.overdueCount ?? 0)}
          color={GOLD}
          sub=">3 DAYS"
        />
        <StatCard
          label="报价待回复"
          value={loading ? '…' : (quotation?.total ?? '—')}
          color={BLUE}
          sub={quotation ? `${quotation.overdueCount} 超时` : 'QUOTED'}
        />
        <StatCard
          label="发票待处理"
          value={loading ? '…' : (invoice?.total ?? '—')}
          color={GREEN}
          sub={invoice ? `草稿${invoice.byStatus.draft ?? 0} · 待审${invoice.byStatus.waiting_approval ?? 0}` : 'PENDING'}
        />
      </div>

      {/* ── AI 建议先处理 ──────────────────────────────────────────────────────── */}
      <SectionHead icon="⚡" title="AI 建议先处理" count={topSuggestions.length} />

      {topSuggestions.length === 0 && !loading && (
        <Row>
          <span style={{ fontSize: 13, color: GREEN }}>✓ 暂无紧急事项 — 今日状态良好</span>
        </Row>
      )}

      {topSuggestions.map(item => (
        <Row key={item.key}>
          <Tag label={item.type} color={TYPE_COLOR[item.type] || GOLD} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T1 }}>{item.customer}</div>
            <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>
              {item.reason}
              {item.amount && <span style={{ color: GOLD, marginLeft: 8, fontWeight: 700 }}>{item.amount}</span>}
            </div>
          </div>
          <div style={{ fontSize: 12, color: T2, maxWidth: 160, textAlign: 'right', flexShrink: 0 }}>{item.action}</div>
          <button
            onClick={() => navigate(item.route)}
            style={{ padding: '6px 14px', borderRadius: 7, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            查看详情
          </button>
        </Row>
      ))}

      {/* ── 今日跟进 ─────────────────────────────────────────────────────────── */}
      <SectionHead icon="📋" title="今日跟进" count={stats?.todayFollowups.length ?? 0} />

      {(!stats || stats.todayFollowups.length === 0) && !loading && (
        <Row><span style={{ fontSize: 13, color: T2 }}>今日无待跟进记录</span></Row>
      )}

      {stats?.todayFollowups.map(task => {
        const isUrgent = stats.actionCenterGroups.urgent.some(u => u.id === task.id);
        const daysOverdue = task.nextFollowUpAt
          ? Math.floor((Date.now() - new Date(task.nextFollowUpAt).getTime()) / 86400000)
          : 0;
        return (
          <Row key={task.id}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T1 }}>{task.clientName}</span>
                {isUrgent && <Tag label="紧急" color={RED} />}
                {task.priority === 'A' && <Tag label="A级" color={RED} />}
                {task.priority === 'B' && <Tag label="B级" color={GOLD} />}
              </div>
              <div style={{ fontSize: 11, color: T2 }}>
                {task.tradeStatus || '—'}
                {task.owner && <span style={{ marginLeft: 8 }}>· {task.owner}</span>}
                {daysOverdue > 0 && <span style={{ color: RED, marginLeft: 8 }}>逾期{daysOverdue}天</span>}
              </div>
            </div>
            {task.nextFollowUpAt && (
              <div style={{ fontSize: 11, color: daysOverdue > 0 ? RED : GOLD, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {new Date(task.nextFollowUpAt).toLocaleDateString('zh-CN')}
              </div>
            )}
            <button
              onClick={() => navigate('/crm?tab=followup')}
              style={{ padding: '6px 14px', borderRadius: 7, background: `${BLUE}18`, border: `1px solid ${BLUE}40`, color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              查看
            </button>
          </Row>
        );
      })}

      {/* ── 报价待回复 ───────────────────────────────────────────────────────── */}
      <SectionHead icon="💬" title="报价待回复" count={quotation?.total} />

      {!quotation && !loading && (
        <Row><span style={{ fontSize: 13, color: T2 }}>数据加载失败</span></Row>
      )}
      {quotation?.total === 0 && (
        <Row><span style={{ fontSize: 13, color: GREEN }}>✓ 无待回复报价</span></Row>
      )}
      {quotation?.quotes.map(q => (
        <Row key={q.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T1 }}>{q.customerName}</div>
            {q.projectName && <div style={{ fontSize: 11, color: T2, marginTop: 1 }}>{q.projectName}</div>}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {q.currency} {Number(q.grandTotal).toLocaleString()}
          </span>
          <span style={{ fontSize: 11, color: q.overdue ? RED : T2, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
            {q.daysAgo}天前
          </span>
          {q.overdue && <Tag label="超时" color={RED} />}
          <button
            onClick={() => navigate('/quotation')}
            style={{ padding: '6px 14px', borderRadius: 7, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            查看
          </button>
        </Row>
      ))}

      {/* ── 发票待处理 ───────────────────────────────────────────────────────── */}
      <SectionHead icon="🧾" title="发票待处理" count={invoice?.total} />

      {!invoice && !loading && (
        <Row><span style={{ fontSize: 13, color: T2 }}>数据加载失败</span></Row>
      )}
      {invoice?.total === 0 && (
        <Row><span style={{ fontSize: 13, color: GREEN }}>✓ 无待处理发票</span></Row>
      )}
      {invoice?.items.map(inv => (
        <Row key={inv.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T1 }}>{inv.customerName}</div>
            <div style={{ fontSize: 11, color: T2, marginTop: 1 }}>{inv.invoiceNo}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {inv.currency} {Number(inv.grandTotal).toLocaleString()}
          </span>
          <Tag label={STATUS_LABEL[inv.status] || inv.status} color={STATUS_COLOR[inv.status] || T2} />
          <button
            onClick={() => navigate('/ai?tab=invoice')}
            style={{ padding: '6px 14px', borderRadius: 7, background: `${GREEN}18`, border: `1px solid ${GREEN}40`, color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            查看
          </button>
        </Row>
      ))}

      {/* ── 员工任务 (Coming Soon) ────────────────────────────────────────────── */}
      <SectionHead icon="👥" title="员工任务分配" />
      <Row>
        <span style={{ fontSize: 12, color: T2, fontStyle: 'italic' }}>Coming Soon — 员工任务系统 V2 规划中</span>
      </Row>

      {/* Footer */}
      <div style={{ marginTop: 20, fontSize: 10, color: T2, fontFamily: 'IBM Plex Mono,monospace', textAlign: 'center' }}>
        数据来源：CRM (localStorage) · Supabase quotation_records · Supabase invoice_drafts
        {quotation && <span> · 报价更新 {new Date(quotation.asOf).toLocaleTimeString('zh-CN')}</span>}
      </div>
    </div>
  );
}
