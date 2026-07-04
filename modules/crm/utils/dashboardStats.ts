/**
 * dashboardStats.ts — Single source of truth for ALL Dashboard metrics.
 *
 * RULE: No component may filter tasks[] on its own for display numbers.
 *       Every number shown on the Dashboard comes from this object.
 *
 * See CLAUDE.md § "统计口径" for authoritative definitions.
 *
 * Data sources (must not be mixed):
 *   【全部业务主档案】 = ALL non-deleted tasks, deduped by businessId
 *                       → totalBusinesses, totalProjects, totalTrades, priorityStats
 *   【今日待跟进】     = Follow-up Log only (notionSource≠contact_only), deduped,
 *                       nextFollowUpAt ≤ today, tradeStatus NOT IN excluded
 *                       → todayFollowupCount, todayFollowups, actionCenterGroups
 *   【优先级分布】     = 全部业务主档案 (A+B+C must equal totalBusinesses)
 *   【项目类型占比】   = 全部业务主档案
 *   【执行中项目】     = businessType=PROJECT AND tradeStatus=执行中
 *   【执行中业务】     = tradeStatus=执行中 (all businessTypes)
 */

import { FollowUpTask } from '../types';
import { getTaskBusinessId } from './businessId';

// ── Constants ──────────────────────────────────────────────────────────────────

const FOLLOWUP_EXCLUDED: string[] = ['暂缓', '已成交', '已归档', '执行中'];
const QUOTE_ESCALATE_DAYS = 3;

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcDaysOverdue(nextFollowUpAt: string | undefined): number {
  if (!nextFollowUpAt) return -999;
  const today = new Date().toISOString().slice(0, 10);
  const a = new Date(nextFollowUpAt.slice(0, 10)).getTime();
  const b = new Date(today).getTime();
  return Math.round((b - a) / 86400000);
}

/** Dedup a task list by businessId. When duplicates exist, keeps the one with
 *  the latest nextFollowUpAt (for follow-up selection) or first found (for masters). */
function dedupByBizId(
  tasks: FollowUpTask[],
  strategy: 'latest' | 'first' = 'first',
): FollowUpTask[] {
  const map = new Map<string, FollowUpTask>();
  for (const t of tasks) {
    const key = (t as any).businessId || getTaskBusinessId(t.id) || t.leadId || t.id;
    if (!map.has(key)) {
      map.set(key, t);
    } else if (strategy === 'latest') {
      const existing = map.get(key)!;
      if ((t.nextFollowUpAt || '') > (existing.nextFollowUpAt || '')) {
        map.set(key, t);
      }
    }
  }
  return Array.from(map.values());
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActionCenterGroups {
  /**
   * 今日必须推进:
   *   - tradeStatus=需求整理中 AND overdue >= 0
   *   - tradeStatus=已报价待确认 AND overdue >= QUOTE_ESCALATE_DAYS
   *   - priority=A AND overdue >= 0
   * Source: todayFollowups
   */
  urgent: FollowUpTask[];

  /**
   * 待报价 · 等供应商回价
   * Source: todayFollowups where tradeStatus=待报价 (not already in urgent)
   */
  pendingQuote: FollowUpTask[];

  /**
   * 已报价待确认 (not yet escalated to urgent)
   * Source: todayFollowups where tradeStatus=已报价待确认, overdue < QUOTE_ESCALATE_DAYS
   */
  waitingConfirm: FollowUpTask[];

  /**
   * 新询盘 · 其他 — catch-all for todayFollowups not claimed by above three.
   * INVARIANT: urgent + pendingQuote + waitingConfirm + others = todayFollowups.length
   */
  others: FollowUpTask[];

  /**
   * 暂缓中 — tradeStatus=暂缓, separate from todayFollowups (excluded from today count).
   * Source: Follow-up Log records (notionSource≠contact_only), all dates.
   */
  paused: FollowUpTask[];
}

export interface PriorityStats {
  A: number;
  B: number;
  C: number;
  /** INVARIANT: total == DashboardStats.totalBusinesses */
  total: number;
}

export interface DashboardStats {
  // ── 全部业务主档案 ─────────────────────────────────────────────────────────
  /** All non-deleted tasks deduped by businessId */
  totalBusinesses: number;
  /** businessType = PROJECT (项目型) */
  totalProjects: number;
  /** businessType = TRADE (贸易型) */
  totalTrades: number;

  // ── 今日待跟进 ─────────────────────────────────────────────────────────────
  /**
   * Authoritative count — uses API value when available (computed before orphan merge).
   * Falls back to todayFollowups.length when API value not yet received.
   */
  todayFollowupCount: number;
  /** The actual FollowUpTask records for today's follow-ups (used by ActionCenter) */
  todayFollowups: FollowUpTask[];

  // ── Action Center ──────────────────────────────────────────────────────────
  /**
   * Partitioned groups derived from todayFollowups.
   * SUM: urgent + pendingQuote + waitingConfirm + others == todayFollowups.length
   * paused is separate.
   */
  actionCenterGroups: ActionCenterGroups;

  // ── Analytics ──────────────────────────────────────────────────────────────
  /**
   * Priority breakdown of ALL business master records.
   * INVARIANT: A + B + C == totalBusinesses
   */
  priorityStats: PriorityStats;

  /** Follow-up Log records overdue > 3 days (not in excluded statuses) */
  overdueCount: number;

  // ── Executing (two explicit definitions — never mix) ──────────────────────
  /** businessType=PROJECT AND tradeStatus=执行中 → used on 控制中心 stat card */
  executingProjectsCount: number;
  /** tradeStatus=执行中 for ALL businessTypes → matches 客户跟进 Kanban column */
  executingBusinessesCount: number;

  // ── High priority (for stat card 2) ───────────────────────────────────────
  /** priority=A, not in FOLLOWUP_EXCLUDED, from Follow-up Log */
  highPriorityCount: number;
}

// ── Main function ──────────────────────────────────────────────────────────────

export function buildDashboardStats(
  tasks: FollowUpTask[],
  /** Pass API-computed todayFollowupCount when available for highest accuracy */
  apiTodayFollowupCount?: number | null,
): DashboardStats {
  const todayISO = new Date().toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);

  // ── 1. 全部业务主档案 ─────────────────────────────────────────────────────
  // "All businesses" = active only (not deleted, not archived/暂缓).
  // Archived records have been closed and should not inflate stats.
  const nonDeleted = tasks.filter(t => t.status !== 'deleted');
  const activeOnly  = nonDeleted.filter(t => t.status !== 'archived');
  const allBusinesses = dedupByBizId(activeOnly, 'first');
  const totalBusinesses = allBusinesses.length;
  const totalProjects = allBusinesses.filter(t =>
    (t as any).businessType === 'PROJECT' || (t as any).businessType === '项目型'
  ).length;
  const totalTrades = allBusinesses.filter(t =>
    (t as any).businessType === 'TRADE' || (t as any).businessType === '贸易型'
  ).length;

  // ── 2. 今日待跟进 ─────────────────────────────────────────────────────────
  // Follow-up Log only (notionSource !== 'contact_only'), deduped by businessId,
  // status=todo, not excluded, nextFollowUpAt <= today
  const followupCandidates = nonDeleted.filter(t =>
    t.status === 'todo' &&
    (t as any).notionSource !== 'contact_only' &&
    !FOLLOWUP_EXCLUDED.includes(t.tradeStatus) &&
    !!t.nextFollowUpAt
  );

  // Sort by nextFollowUpAt desc so dedup keeps the latest per businessId
  followupCandidates.sort((a, b) => (b.nextFollowUpAt || '') < (a.nextFollowUpAt || '') ? -1 : 1);
  const latestFollowups = dedupByBizId(followupCandidates, 'latest');

  const todayFollowups = latestFollowups.filter(t =>
    t.nextFollowUpAt!.slice(0, 10) <= todayISO
  );

  // Use API count if available (most accurate — computed before orphan merge in api/notion-sync.ts)
  const todayFollowupCount = apiTodayFollowupCount ?? todayFollowups.length;

  // ── 3. Action Center groups ────────────────────────────────────────────────
  const assignedIds = new Set<string>();

  const urgent = todayFollowups.filter(t => {
    const od = calcDaysOverdue(t.nextFollowUpAt);
    if (t.tradeStatus === '需求整理中' && od >= 0) return true;
    if (t.tradeStatus === '已报价待确认' && od >= QUOTE_ESCALATE_DAYS) return true;
    if (t.priority === 'A' && od >= 0) return true;
    return false;
  });
  urgent.forEach(t => assignedIds.add(t.id));

  const pendingQuote = todayFollowups.filter(t =>
    !assignedIds.has(t.id) && t.tradeStatus === '待报价'
  );
  pendingQuote.forEach(t => assignedIds.add(t.id));

  const waitingConfirm = todayFollowups.filter(t =>
    !assignedIds.has(t.id) && t.tradeStatus === '已报价待确认'
  );
  waitingConfirm.forEach(t => assignedIds.add(t.id));

  // Catch-all: everything in todayFollowups not yet assigned (新询盘, 新建, etc.)
  const others = todayFollowups.filter(t => !assignedIds.has(t.id));

  // Paused: separate from today's count, from Follow-up Log only
  const paused = nonDeleted.filter(t =>
    t.status === 'todo' &&
    (t as any).notionSource !== 'contact_only' &&
    t.tradeStatus === '暂缓'
  );
  // Dedup paused by businessId too
  const pausedDeduped = dedupByBizId(paused, 'first');

  const actionCenterGroups: ActionCenterGroups = {
    urgent,
    pendingQuote,
    waitingConfirm,
    others,
    paused: pausedDeduped,
  };

  // Invariant check (development guard)
  const blockSum = urgent.length + pendingQuote.length + waitingConfirm.length + others.length;
  if (blockSum !== todayFollowups.length) {
    console.warn(
      `[dashboardStats] INVARIANT BROKEN: ` +
      `urgent(${urgent.length}) + pendingQuote(${pendingQuote.length}) + ` +
      `waitingConfirm(${waitingConfirm.length}) + others(${others.length}) = ${blockSum} ` +
      `!= todayFollowups(${todayFollowups.length})`
    );
  }

  // ── 4. 优先级分布 (全部业务主档案) ────────────────────────────────────────
  const prioA = allBusinesses.filter(t => t.priority === 'A').length;
  const prioC = allBusinesses.filter(t => t.priority === 'C').length;
  const prioB = totalBusinesses - prioA - prioC; // everyone else = B or unset
  const priorityStats: PriorityStats = {
    A: prioA,
    B: prioB,
    C: prioC,
    total: totalBusinesses,
  };

  // ── 5. 逾期风险 (from latestFollowups, > 3 days) ──────────────────────────
  const overdueCount = latestFollowups.filter(t =>
    !!t.nextFollowUpAt && t.nextFollowUpAt.slice(0, 10) < threeDaysAgo
  ).length;

  // ── 6. Executing counts ───────────────────────────────────────────────────
  const executingProjectsCount = nonDeleted.filter(t =>
    t.status === 'todo' &&
    t.tradeStatus === '执行中' &&
    ((t as any).businessType === 'PROJECT' || (t as any).businessType === '项目型')
  ).length;

  const executingBusinessesCount = nonDeleted.filter(t =>
    t.status === 'todo' && t.tradeStatus === '执行中'
  ).length;

  // ── 7. 高优先客户 (A级, Follow-up Log, not excluded) ─────────────────────
  const highPriorityCount = latestFollowups.filter(t =>
    t.status === 'todo' && t.priority === 'A'
  ).length;

  return {
    totalBusinesses,
    totalProjects,
    totalTrades,
    todayFollowupCount,
    todayFollowups,
    actionCenterGroups,
    priorityStats,
    overdueCount,
    executingProjectsCount,
    executingBusinessesCount,
    highPriorityCount,
  };
}
