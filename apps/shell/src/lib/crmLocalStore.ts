/**
 * crmLocalStore.ts — Read-only access to CRM data cached in localStorage.
 *
 * Data source: ICARE_HISTORY_V1 (FollowUpTask[]), written by Notion sync.
 * This module is FRONTEND ONLY — never calls any API or writes any data.
 * Does not modify CRM records, Follow-up Logs, or Notion sync.
 *
 * Used by: Daily Brief and Customer 360 result panels in AIPage.tsx.
 */

import type { FollowUpTask, TradeStatus } from '../../../modules/crm/types';

const LS_KEY = 'ICARE_HISTORY_V1';

// Statuses excluded from "today's active follow-ups" — matches dashboardStats.ts
const FOLLOWUP_EXCLUDED: TradeStatus[] = ['暂缓', '已成交', '已归档', '执行中'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Read all CRM tasks from localStorage. Returns [] if not available or parse fails. */
export function readCRMTasks(): FollowUpTask[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CRMBriefStats {
  hasData: boolean;
  todayCount: number;
  overdueCount: number;
  highPriorityCount: number;
  topItems: CRMBriefItem[];
}

export interface CRMBriefItem {
  id: string;
  clientName: string;
  tradeStatus: string;
  nextFollowUpAt: string;
  priority: 'A' | 'B' | 'C';
  goal: string;
  owner: string;
  daysOverdue: number;
  isOverdue: boolean;
}

/**
 * Compute daily brief CRM stats from local tasks.
 * Applies the same filtering rules as dashboardStats.ts:
 *   - status = 'todo'
 *   - notionSource ≠ 'contact_only'
 *   - tradeStatus NOT IN FOLLOWUP_EXCLUDED
 *   - nextFollowUpAt ≤ today
 *   - Not deleted / archived
 */
export function getCRMBriefStats(tasks: FollowUpTask[]): CRMBriefStats {
  if (!tasks.length) return { hasData: false, todayCount: 0, overdueCount: 0, highPriorityCount: 0, topItems: [] };

  const today = todayISO();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);

  const active = tasks.filter(t =>
    t.status === 'todo' &&
    t.status !== 'deleted' as any &&
    (t as any).notionSource !== 'contact_only' &&
    !FOLLOWUP_EXCLUDED.includes(t.tradeStatus) &&
    !!t.nextFollowUpAt &&
    t.nextFollowUpAt.slice(0, 10) <= today
  );

  const overdueItems = active.filter(t => t.nextFollowUpAt!.slice(0, 10) < threeDaysAgo);
  const highPriority = active.filter(t => t.priority === 'A');

  // Sort: overdue first, then by priority A > B > C, then by nextFollowUpAt asc
  const sorted = [...active].sort((a, b) => {
    const aOverdue = a.nextFollowUpAt!.slice(0, 10) < threeDaysAgo;
    const bOverdue = b.nextFollowUpAt!.slice(0, 10) < threeDaysAgo;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const prioOrder = { A: 0, B: 1, C: 2 };
    const pDiff = (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1);
    if (pDiff !== 0) return pDiff;
    return (a.nextFollowUpAt || '') < (b.nextFollowUpAt || '') ? -1 : 1;
  });

  const topItems: CRMBriefItem[] = sorted.slice(0, 5).map(t => {
    const daysOverdue = Math.floor(
      (new Date(today).getTime() - new Date(t.nextFollowUpAt!.slice(0, 10)).getTime()) / 86400000
    );
    return {
      id:             t.id,
      clientName:     t.clientName || '—',
      tradeStatus:    t.tradeStatus || '—',
      nextFollowUpAt: t.nextFollowUpAt || '',
      priority:       t.priority,
      goal:           t.goal || '',
      owner:          t.owner || '',
      daysOverdue,
      isOverdue:      daysOverdue > 3,
    };
  });

  return {
    hasData:          true,
    todayCount:       active.length,
    overdueCount:     overdueItems.length,
    highPriorityCount: highPriority.length,
    topItems,
  };
}

export interface CRMCustomerMatch {
  hasData: boolean;
  matchedTasks: CRMCustomerTask[];
  latestTask: CRMCustomerTask | null;
  totalCount: number;
  activeCount: number;
}

export interface CRMCustomerTask {
  id: string;
  clientName: string;
  tradeStatus: string;
  priority: 'A' | 'B' | 'C';
  nextFollowUpAt: string;
  goal: string;
  lastContext: string;
  owner: string;
  isActive: boolean;
  isOverdue: boolean;
  daysOverdue: number;
}

/**
 * Find CRM records for a specific customer, matching against name + aliases.
 * Returns all matches sorted by nextFollowUpAt descending (most recent first).
 */
export function getCRMCustomerData(
  tasks: FollowUpTask[],
  customerInput: string,
  aliases: string[] = [],
): CRMCustomerMatch {
  if (!tasks.length || !customerInput.trim()) {
    return { hasData: false, matchedTasks: [], latestTask: null, totalCount: 0, activeCount: 0 };
  }

  const searchTerms = [customerInput, ...aliases].map(s => s.toLowerCase().trim()).filter(Boolean);

  const matched = tasks.filter(t => {
    if (t.status === 'deleted' as any) return false;
    const name = (t.clientName || '').toLowerCase();
    return searchTerms.some(term => name.includes(term) || term.includes(name));
  });

  if (!matched.length) {
    return { hasData: true, matchedTasks: [], latestTask: null, totalCount: 0, activeCount: 0 };
  }

  const today = todayISO();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);

  const result: CRMCustomerTask[] = matched
    .sort((a, b) => (b.nextFollowUpAt || '') < (a.nextFollowUpAt || '') ? -1 : 1)
    .map(t => {
      const nextDate = (t.nextFollowUpAt || '').slice(0, 10);
      const daysOverdue = nextDate
        ? Math.floor((new Date(today).getTime() - new Date(nextDate).getTime()) / 86400000)
        : 0;
      const isActive = t.status === 'todo' && !FOLLOWUP_EXCLUDED.includes(t.tradeStatus);
      return {
        id:             t.id,
        clientName:     t.clientName || '—',
        tradeStatus:    t.tradeStatus || '—',
        priority:       t.priority,
        nextFollowUpAt: t.nextFollowUpAt || '',
        goal:           t.goal || '',
        lastContext:    t.lastContext || '',
        owner:          t.owner || '',
        isActive,
        isOverdue:      daysOverdue > 3 && isActive,
        daysOverdue,
      };
    });

  const activeCount = result.filter(r => r.isActive).length;

  return {
    hasData:      true,
    matchedTasks: result,
    latestTask:   result[0] || null,
    totalCount:   result.length,
    activeCount,
  };
}
