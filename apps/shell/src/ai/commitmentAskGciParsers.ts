// GCI Executive Desk — Task 10: Ask GCI triggers for the Commitment Tracker.
// Pure regex matching only, read-only except parseUpdateCommitmentStatusCommand,
// which only ever produces a proposed change for the caller to confirm.
export type CommitmentQueryMode = 'my_outbound_open' | 'inbound_open' | 'due_today' | 'overdue' | 'history_for';

export const COMMITMENT_MY_OUTBOUND_RE = /我答应过别人什么还没做|我答应过什么还没做|我答应别人的事情还没做/u;
export const COMMITMENT_INBOUND_RE = /别人答应我的事情有哪些还没完成|别人答应我什么还没完成|别人答应我的事情/u;
export const COMMITMENT_DUE_TODAY_RE = /今天有哪些承诺到期|今天到期的承诺/u;
export const COMMITMENT_OVERDUE_RE = /哪些承诺已经逾期|哪些承诺逾期了|逾期的承诺有哪些/u;
export const COMMITMENT_HISTORY_FOR_RE = /关于\s*(.+?)\s*我答应过什么/u;

export function matchCommitmentQuery(raw: string): { mode: CommitmentQueryMode; name?: string } | null {
  const t = raw.trim();

  const historyMatch = t.match(COMMITMENT_HISTORY_FOR_RE);
  if (historyMatch) {
    const name = historyMatch[1].trim();
    return name ? { mode: 'history_for', name } : null;
  }
  if (COMMITMENT_DUE_TODAY_RE.test(t)) return { mode: 'due_today' };
  if (COMMITMENT_OVERDUE_RE.test(t)) return { mode: 'overdue' };
  if (COMMITMENT_MY_OUTBOUND_RE.test(t)) return { mode: 'my_outbound_open' };
  if (COMMITMENT_INBOUND_RE.test(t)) return { mode: 'inbound_open' };
  return null;
}

// ── Write intent: "把这条承诺标记为完成" / "把 MAG 这条承诺标记为完成". The name
// group may be empty — an empty/ambiguous reference must never be guessed;
// the caller is responsible for asking Chris to pick a specific commitment. ──
export function parseUpdateCommitmentStatusCommand(raw: string): { name: string; targetStatus: 'completed' | 'cancelled' } | null {
  const m = raw.trim().match(/^把\s*(.*?)\s*(?:这条|这个|那条|那个)?承诺标记为\s*(完成|取消)[。.!！]?$/u);
  if (!m) return null;
  const name = m[1].trim();
  const targetStatus: 'completed' | 'cancelled' = m[2] === '完成' ? 'completed' : 'cancelled';
  return { name, targetStatus };
}
