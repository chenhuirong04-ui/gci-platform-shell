// GCI Executive Desk — Task 8/9: Ask GCI triggers for the Decision Inbox
// and its execution follow-through. Pure regex matching only, read-only
// except parseUpdateExecutionStatusCommand, which only ever produces a
// proposed change for the caller to confirm — it never writes anything itself.
import type { ExecutionStatus } from '../lib/decisionInbox';

export type DecisionQueryMode =
  | 'pending_list'
  | 'pending_count'
  | 'recent_decided'
  | 'history_for'
  | 'not_started'
  | 'due_today'
  | 'blocked'
  | 'execution_status_for';

export const DECISION_PENDING_LIST_RE = /现在有哪些事情等我决定|有哪些事情等我决定|等我决定的事情有哪些/u;
export const DECISION_PENDING_COUNT_RE = /我还有几个决定没处理|还有几个决定没处理|有几个决定没做/u;
export const DECISION_RECENT_RE = /我最近做了哪些决定|最近做了哪些决定|最近的决定/u;
export const DECISION_HISTORY_FOR_RE = /关于\s*(.+?)\s*我(?:之前|以前)?做过(?:什么|哪些)决定/u;
export const DECISION_NOT_STARTED_RE = /我决定过但还没执行的事情有哪些|决定过但没执行的事情|决定了还没执行/u;
export const DECISION_DUE_TODAY_RE = /哪些决定今天到期|今天到期的决定/u;
export const DECISION_BLOCKED_RE = /哪些事情卡住了|哪些决定卡住了|卡住的事情有哪些/u;
export const DECISION_EXECUTION_STATUS_FOR_RE = /(.+?)\s*的决定执行到哪里了/u;

export function matchDecisionQuery(raw: string): { mode: DecisionQueryMode; name?: string } | null {
  const t = raw.trim();

  const historyMatch = t.match(DECISION_HISTORY_FOR_RE);
  if (historyMatch) {
    const name = historyMatch[1].trim();
    return name ? { mode: 'history_for', name } : null;
  }
  const execForMatch = t.match(DECISION_EXECUTION_STATUS_FOR_RE);
  if (execForMatch) {
    const name = execForMatch[1].trim();
    return name ? { mode: 'execution_status_for', name } : null;
  }
  if (DECISION_NOT_STARTED_RE.test(t)) return { mode: 'not_started' };
  if (DECISION_DUE_TODAY_RE.test(t)) return { mode: 'due_today' };
  if (DECISION_BLOCKED_RE.test(t)) return { mode: 'blocked' };
  if (DECISION_PENDING_COUNT_RE.test(t)) return { mode: 'pending_count' };
  if (DECISION_PENDING_LIST_RE.test(t)) return { mode: 'pending_list' };
  if (DECISION_RECENT_RE.test(t)) return { mode: 'recent_decided' };
  return null;
}

// ── Write intent: "把 Ray 这个决定标记为进行中。" — parsing only. The caller
// must show a confirmation card and only call updateExecutionStatus() after
// Chris explicitly confirms; this function never touches the database. ──
const STATUS_LABEL_MAP: Record<string, ExecutionStatus> = {
  进行中: 'in_progress',
  执行中: 'in_progress',
  完成: 'completed',
  已完成: 'completed',
  阻塞: 'blocked',
  卡住: 'blocked',
  待执行: 'pending',
};

export function parseUpdateExecutionStatusCommand(raw: string): { name: string; targetStatus: ExecutionStatus; targetLabel: string } | null {
  const m = raw.trim().match(/^把\s*(.+?)\s*(?:这个|那个)?决定\s*标记为\s*(.+?)[。.!！]?$/u);
  if (!m) return null;
  const name = m[1].trim();
  const statusLabel = m[2].trim();
  const targetStatus = STATUS_LABEL_MAP[statusLabel];
  if (!name || !targetStatus) return null;
  return { name, targetStatus, targetLabel: statusLabel };
}
