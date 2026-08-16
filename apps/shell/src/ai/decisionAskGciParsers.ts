// GCI Executive Desk — Task 8: Ask GCI triggers for the Decision Inbox.
// Pure regex matching only, read-only. Never lets Ask GCI make a decision
// on Chris's behalf — these only surface/query existing records.
export type DecisionQueryMode = 'pending_list' | 'pending_count' | 'recent_decided' | 'history_for';

export const DECISION_PENDING_LIST_RE = /现在有哪些事情等我决定|有哪些事情等我决定|等我决定的事情有哪些/u;
export const DECISION_PENDING_COUNT_RE = /我还有几个决定没处理|还有几个决定没处理|有几个决定没做/u;
export const DECISION_RECENT_RE = /我最近做了哪些决定|最近做了哪些决定|最近的决定/u;
export const DECISION_HISTORY_FOR_RE = /关于\s*(.+?)\s*我(?:之前|以前)?做过(?:什么|哪些)决定/u;

export function matchDecisionQuery(raw: string): { mode: DecisionQueryMode; name?: string } | null {
  const t = raw.trim();
  const historyMatch = t.match(DECISION_HISTORY_FOR_RE);
  if (historyMatch) {
    const name = historyMatch[1].trim();
    return name ? { mode: 'history_for', name } : null;
  }
  if (DECISION_PENDING_COUNT_RE.test(t)) return { mode: 'pending_count' };
  if (DECISION_PENDING_LIST_RE.test(t)) return { mode: 'pending_list' };
  if (DECISION_RECENT_RE.test(t)) return { mode: 'recent_decided' };
  return null;
}
