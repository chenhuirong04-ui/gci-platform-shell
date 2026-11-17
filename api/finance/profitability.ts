// GET /api/finance/profitability?project=&customer=&period=   (GIA P3 step 3, read-only)
// 财务中心 → 项目与客户利润 (modules/trade/components/FinanceProfitability.tsx),
// same data and the SAME calculation — not a new profit algorithm:
//   • cash basis: transactions in the period, uncleared cheques excluded
//   • revenue = operating income, cost = operating expense, both via the page's
//     own classifyTransaction / isOperating* (imported, not copied)
//   • project rows = transactions with project_id; transactions without one
//     form the 「未关联项目（历史）」 row, which is NOT in the project KPIs
//   • gross profit = revenue − direct cost; margin = profit / revenue
//   • collected = revenue (cash basis); outstanding = PENDING/PARTIAL orders
//     of that project (customer AR the same per customer)
//   • customer revenue = operating income per customer_id (else name)
//   • period: this_month | last_month | YYYY-MM | all (month = UTC, as the page)
// Cost completeness (the page's own warning, made explicit per row):
//   supplier payments carry no project_id, so project cost is only what was
//   manually linked. A project with revenue but no linked cost is
//   costStatus 'missing' and costRecorded false — never reported as profit.
//   Any linked cost is still 'linked_only' (may be incomplete).
//   The Finance Center has no customer-level cost: a customer's profit is only
//   available through that customer's projects.
// Auth: requireModule('finance'). crm_projects / crm_customers read as the
// caller (RLS); transactions / orders via the same legacy reads the page uses.
import { requireModule, type AuthContext } from '../_lib/auth';
import { json, userRows, loadTransactions, countsTowardBalance, round2, type Txn } from './_read';
import { loadPayloads } from '../trade/_read';
import { classifyTransaction, isOperatingIncomeCategory, isOperatingExpenseCategory } from '../../modules/trade/services/transactionCategories';

export const config = { runtime: 'edge' };

export interface PTxn extends Txn { project_id?: string; customer_id?: string; category?: string; ref_type?: string }
interface Order { crmProjectId?: string; crmCustomerId?: string; status?: string; outstandingAmount?: number }
interface Project { id: string; project_name?: string; customer_id?: string }
interface Customer { id: string; customer_name?: string }

const pct = (profit: number, revenue: number) => (revenue > 0 ? round2((profit / revenue) * 10000) / 100 : null);
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_.,()（）]/g, '');

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Page periods → month filter (null = all time). Month from toISOString() like the page. */
export function periodMonth(period: string, now = new Date()): { key: string; month: string | null } {
  const p = (period || 'all').trim().toLowerCase();
  const thisMonth = now.toISOString().slice(0, 7);
  if (p === 'this_month' || p === 'month') return { key: 'this_month', month: thisMonth };
  if (p === 'last_month') return { key: 'last_month', month: shiftMonth(thisMonth, -1) };
  if (/^\d{4}-\d{2}$/.test(p)) return { key: p, month: p };
  return { key: 'all_time', month: null };
}

export function buildProfitability(
  txns: PTxn[], orders: Order[], projects: Project[], customers: Customer[],
  opts: { period?: string; project?: string; customer?: string; now?: Date } = {},
) {
  const { key: periodKey, month } = periodMonth(opts.period || 'all', opts.now);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const customerNameById = new Map(customers.map((c) => [c.id, c.customer_name || '']));
  const periodTxns = txns.filter((t) => countsTowardBalance(t) && (month === null || String(t.date || '').slice(0, 7) === month));

  // ── Project dimension (FinanceProfitability projectRows) ──
  const map = new Map<string, { revenue: number; directCost: number }>();
  let legacyRevenue = 0;
  let legacyCost = 0;
  for (const t of periodTxns) {
    const cat = classifyTransaction(t as any);
    const isRev = t.type === 'in' && isOperatingIncomeCategory(cat);
    const isCost = t.type === 'out' && isOperatingExpenseCategory(cat);
    if (!isRev && !isCost) continue;
    const amt = Number(t.amount) || 0;
    if (!t.project_id) {
      if (isRev) legacyRevenue = round2(legacyRevenue + amt);
      if (isCost) legacyCost = round2(legacyCost + amt);
      continue;
    }
    const row = map.get(t.project_id) || { revenue: 0, directCost: 0 };
    if (isRev) row.revenue = round2(row.revenue + amt);
    if (isCost) row.directCost = round2(row.directCost + amt);
    map.set(t.project_id, row);
  }

  const allProjects = Array.from(map.entries()).map(([pid, v]) => {
    const proj = projectById.get(pid);
    const outstanding = round2(orders
      .filter((o) => o.crmProjectId === pid && (o.status === 'PENDING' || o.status === 'PARTIAL'))
      .reduce((s, o) => s + (Number(o.outstandingAmount) || 0), 0));
    const grossProfit = round2(v.revenue - v.directCost);
    const costStatus = v.directCost > 0 ? 'linked_only' : v.revenue > 0 ? 'missing' : 'none';
    return {
      projectName: proj?.project_name || `项目 ${pid.slice(0, 8)}`,
      customerId: proj?.customer_id || null,
      customerName: (proj?.customer_id && customerNameById.get(proj.customer_id)) || null,
      revenue: v.revenue,
      directCost: v.directCost,
      grossProfit,
      grossMargin: pct(grossProfit, v.revenue),
      collected: v.revenue,
      outstanding,
      costStatus,
      costRecorded: costStatus === 'linked_only',
      profitNote: costStatus === 'missing'
        ? '未录入/未关联成本：毛利不能视为盈利'
        : costStatus === 'linked_only'
          ? '按已关联到项目的成本计算；供应商付款不会自动关联项目，成本可能不完整'
          : '本期无收入',
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Page KPIs = sums of the real project rows (legacy excluded).
  const kRev = round2(allProjects.reduce((s, r) => s + r.revenue, 0));
  const kCost = round2(allProjects.reduce((s, r) => s + r.directCost, 0));
  const kGp = round2(kRev - kCost);
  const missing = allProjects.filter((r) => r.costStatus === 'missing');

  // ── Customer dimension (FinanceProfitability customerRows / customerArRows) ──
  const cmap = new Map<string, { customerId: string | null; name: string; revenue: number }>();
  for (const t of periodTxns) {
    if (t.type !== 'in' || !isOperatingIncomeCategory(classifyTransaction(t as any))) continue;
    const id = t.customer_id;
    const name = (id && customerNameById.get(id)) || t.customer || '未命名';
    const k = id || `name:${name}`;
    const e = cmap.get(k);
    if (e) e.revenue = round2(e.revenue + (Number(t.amount) || 0));
    else cmap.set(k, { customerId: id || null, name, revenue: round2(Number(t.amount) || 0) });
  }
  const arOf = (id: string) => round2(orders
    .filter((o) => o.crmCustomerId === id && (o.status === 'PENDING' || o.status === 'PARTIAL'))
    .reduce((s, o) => s + (Number(o.outstandingAmount) || 0), 0));
  const allCustomers = Array.from(cmap.values()).map((c) => {
    const projs = allProjects.filter((p) => c.customerId && p.customerId === c.customerId);
    const pRev = round2(projs.reduce((s, p) => s + p.revenue, 0));
    const pCost = round2(projs.reduce((s, p) => s + p.directCost, 0));
    return {
      customerName: c.name,
      linkedToCrm: !!c.customerId,
      revenue: c.revenue,
      collected: c.revenue,
      currentAR: c.customerId ? arOf(c.customerId) : 0,
      cost: null as null,
      costNote: '财务中心没有客户层级成本；成本/利润只能看该客户的项目',
      viaProjects: projs.length ? {
        projectCount: projs.length,
        revenue: pRev, directCost: pCost, grossProfit: round2(pRev - pCost), grossMargin: pct(round2(pRev - pCost), pRev),
        allCostsRecorded: projs.every((p) => p.costRecorded),
      } : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Filters (for the question asked) ──
  const pq = norm(opts.project);
  const cq = norm(opts.customer);
  const projectsOut = allProjects.filter((p) => (!pq || norm(p.projectName).includes(pq)) && (!cq || norm(p.customerName).includes(cq)));
  const customersOut = allCustomers.filter((c) => !cq || norm(c.customerName).includes(cq));

  return {
    period: periodKey,
    month,
    filters: { project: opts.project || null, customer: opts.customer || null },
    projectTotals: {
      revenue: kRev, directCost: kCost, grossProfit: kGp, grossMargin: pct(kGp, kRev),
      projectCount: allProjects.length,
      projectsMissingCost: missing.length,
      allCostsRecorded: allProjects.length > 0 && missing.length === 0,
      warning: missing.length
        ? `${missing.length} 个项目有收入但未录入成本，合计毛利不能视为实际盈利`
        : allProjects.length ? '成本仅含已关联到项目的支出，可能不完整' : null,
    },
    projects: projectsOut.map(({ customerId, ...r }) => r),
    unlinked: legacyRevenue > 0 || legacyCost > 0 ? {
      label: '未关联项目（历史）',
      revenue: legacyRevenue, cost: legacyCost, net: round2(legacyRevenue - legacyCost),
      note: '未关联项目的收支，不计入项目利润，也不是某个项目或客户的利润',
    } : null,
    customers: customersOut.slice(0, 20),
    customerCount: allCustomers.length,
    basis: '现金收付制管理口径（与财务中心「项目与客户利润」一致），非正式损益表',
  };
}

async function loadCrm(ctx: AuthContext) {
  const [projects, customers] = await Promise.all([
    userRows<Project>(ctx, 'crm_projects', 'select=id,project_name,customer_id&status=neq.cancelled&order=created_at.desc&limit=2000'),
    userRows<Customer>(ctx, 'crm_customers', 'select=id,customer_name&is_active=eq.true&limit=1000'),
  ]);
  return { projects, customers };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['finance']);
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams;
  try {
    const [txns, orders, crm] = await Promise.all([
      loadTransactions() as Promise<PTxn[]>,
      loadPayloads<Order>('orders'),
      loadCrm(auth.ctx),
    ]);
    return json({
      ok: true,
      source: 'transactions + orders + crm_projects + crm_customers (财务中心 · 项目与客户利润)',
      currency: 'AED',
      ...buildProfitability(txns, orders, crm.projects, crm.customers, {
        period: q.get('period') || 'all', project: q.get('project')?.trim() || '', customer: q.get('customer')?.trim() || '',
      }),
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
