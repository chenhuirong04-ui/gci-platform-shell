// GCI Executive Desk — Task 15: Ask GCI entry points for the Daily Business
// Brief. All read-only, all backed by the exact same lib/dailyBrief.ts
// getDailyBrief() call Home uses — so an Ask GCI answer can never disagree
// with what's shown on Home.
export type DailyBriefMode = 'brief' | 'top3' | 'contacts' | 'overdue' | 'emails' | 'mia' | 'remaining';

const PATTERNS: { mode: DailyBriefMode; re: RegExp }[] = [
  { mode: 'top3', re: /今天.{0,4}先做.{0,4}(哪|什么)/i },
  { mode: 'contacts', re: /今天.{0,6}(哪些|谁).{0,6}(客户|人).{0,4}(必须|要).{0,4}联系/i },
  { mode: 'overdue', re: /(哪些|什么).{0,6}(事情|事项).{0,6}(已经)?逾期/i },
  { mode: 'emails', re: /今天.{0,6}(哪些|什么)?.{0,4}邮件.{0,4}需要.{0,4}(我)?.{0,4}处理/i },
  { mode: 'mia', re: /mia.{0,6}(今天)?.{0,6}(有没有|值得).{0,10}(新客户|leads?)/i },
  { mode: 'remaining', re: /今天.{0,6}还有.{0,6}(什么|哪些).{0,4}没处理/i },
  { mode: 'brief', re: /今天.{0,4}(我的)?商务重点.{0,4}是什么/i },
  { mode: 'brief', re: /(给我|做一份|生成).{0,6}今天.{0,4}(的)?商务简报/i },
];

export function matchDailyBriefQuery(raw: string): DailyBriefMode | null {
  const t = raw.trim();
  for (const { mode, re } of PATTERNS) {
    if (re.test(t)) return mode;
  }
  return null;
}
