/**
 * followupFilter.ts
 *
 * Single source of truth for "今日待跟进" filtering.
 * Used by: ControlCenter (stat card), ActionCenter (今日必须推进 block).
 *
 * Rules (per CLAUDE.md + user spec 2026-05-20):
 *   1. Only Follow-up Log records (notionSource !== 'contact_only')
 *   2. Deduplicate by businessId — keep latest nextFollowUpAt
 *   3. Excluded statuses: 暂缓 | 已成交 | 已归档 | 执行中
 *   4. "今日待跟进" = nextFollowUpAt <= today
 */

import { FollowUpTask } from '../types';
import { getTaskBusinessId } from './businessId';

// Statuses excluded from all "today follow-up" calculations
export const FOLLOWUP_EXCLUDED_STATUSES: string[] = ['暂缓', '已成交', '已归档', '执行中'];

/**
 * Step 1+2: Return deduplicated Follow-up Log records.
 *
 * - Strips contact_only orphan records (Projects/SB records without a Follow-up Log entry)
 * - Deduplicates by businessId, keeping the record with the latest nextFollowUpAt
 * - Records with undefined notionSource (legacy / adminImportData) are treated as 'followup'
 */
export function getLatestFollowups(tasks: FollowUpTask[]): FollowUpTask[] {
  // Exclude deleted + contact_only orphans
  const followupTasks = tasks.filter(t =>
    t.status !== 'deleted' &&
    (t as any).notionSource !== 'contact_only'
  );

  // Deduplicate by businessId — keep latest nextFollowUpAt
  const latestByKey = new Map<string, FollowUpTask>();
  for (const t of followupTasks) {
    const key = (t as any).businessId || getTaskBusinessId(t.id) || t.leadId || t.id;
    const existing = latestByKey.get(key);
    if (!existing || (t.nextFollowUpAt || '') > (existing.nextFollowUpAt || '')) {
      latestByKey.set(key, t);
    }
  }

  return Array.from(latestByKey.values());
}

export interface TodayFollowupsResult {
  result: FollowUpTask[];
  debug: {
    rawFollowupCount: number;           // all non-contact_only tasks
    latestFollowupByBusinessIdCount: number; // after businessId dedup
    todayFollowupCount: number;         // after date + status filter
  };
}

/**
 * Step 1+2+3+4: Return today's actionable follow-ups.
 *
 * Also emits a console.log with debug counts so the source of the number can be verified.
 */
export function getTodayFollowups(tasks: FollowUpTask[], todayISO: string): TodayFollowupsResult {
  const rawFollowups = tasks.filter(t =>
    t.status !== 'deleted' &&
    (t as any).notionSource !== 'contact_only'
  );

  const latest = getLatestFollowups(tasks);

  const result = latest.filter(t =>
    t.status === 'todo' &&
    !FOLLOWUP_EXCLUDED_STATUSES.includes(t.tradeStatus) &&
    !!t.nextFollowUpAt &&
    t.nextFollowUpAt.slice(0, 10) <= todayISO
  );

  const debug = {
    rawFollowupCount: rawFollowups.length,
    latestFollowupByBusinessIdCount: latest.length,
    todayFollowupCount: result.length,
  };

  // Always log so counts can be verified in DevTools console
  console.log('[今日待跟进 filter]', {
    ...debug,
    totalTasksInStore: tasks.length,
    contactOnlyCount: tasks.filter(t => (t as any).notionSource === 'contact_only').length,
    excludedByStatus: latest.filter(t =>
      t.status === 'todo' && FOLLOWUP_EXCLUDED_STATUSES.includes(t.tradeStatus)
    ).length,
    excludedByDate: latest.filter(t =>
      t.status === 'todo' &&
      !FOLLOWUP_EXCLUDED_STATUSES.includes(t.tradeStatus) &&
      !!t.nextFollowUpAt &&
      t.nextFollowUpAt.slice(0, 10) > todayISO
    ).length,
  });

  return { result, debug };
}
