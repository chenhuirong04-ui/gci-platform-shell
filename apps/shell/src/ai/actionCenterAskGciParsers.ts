// GCI Executive Desk — Task 7: Ask GCI triggers for the Boss Action Center.
// Pure regex matching only — the actual data comes from getBossActions()
// (apps/shell/src/lib/actionCenter.ts), never fabricated here.
export type BossActionQueryMode = 'most_important' | 'do_first' | 'waiting_decision' | 'unhandled_today';

export const BOSS_MOST_IMPORTANT_RE = /今天最重要的事情是什么|今天最重要的事|今天最紧急/u;
export const BOSS_DO_FIRST_RE = /我现在先处理什么|现在先处理什么|先处理哪个|接下来先做什么/u;
export const BOSS_WAITING_DECISION_RE = /有哪些事情在等我决定|等我决定|需要我决定的事情|哪些事情需要我拍板/u;
export const BOSS_UNHANDLED_TODAY_RE = /今天还有什么没处理|今天还有什么没做|今天剩下.*没处理|今天还有哪些没处理/u;

export function matchBossActionQueryMode(raw: string): BossActionQueryMode | null {
  const t = raw.trim();
  if (BOSS_MOST_IMPORTANT_RE.test(t)) return 'most_important';
  if (BOSS_DO_FIRST_RE.test(t)) return 'do_first';
  if (BOSS_WAITING_DECISION_RE.test(t)) return 'waiting_decision';
  if (BOSS_UNHANDLED_TODAY_RE.test(t)) return 'unhandled_today';
  return null;
}
