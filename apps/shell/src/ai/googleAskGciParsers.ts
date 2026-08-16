// GCI Executive Desk — Task 5.2 Ask GCI natural-language parsers for
// Gmail / Drive / Calendar read-only actions. Pure functions, no side effects.

function cleanQuery(s: string): string {
  return s
    .replace(/^(?:我)?(?:以前|之前|历史上?)?(?:做过的|做过|经手的)?\s*/u, '')
    .replace(/[。.!！]+$/g, '')
    .trim();
}

// "找一下 MAG 最近的邮件" → "MAG"
export function parseGmailSearchCommand(raw: string): string | null {
  const m = raw.trim().match(/^找一下\s*(.+?)\s*(?:最近的?)?邮件/u);
  if (!m) return null;
  const q = cleanQuery(m[1]);
  return q.length > 0 ? q : null;
}

// "找一下 MAG 的文件" / "找一下我以前做过的 MAG 合作方案" → "MAG" / "MAG 合作"
export function parseDriveSearchCommand(raw: string): string | null {
  const m = raw.trim().match(/^找一下\s*(.+?)\s*(?:的)?(?:文件|资料|方案|报价|合同)/u);
  if (!m) return null;
  const q = cleanQuery(m[1]);
  return q.length > 0 ? q : null;
}

// "MAG 最近沟通到哪里了？" → "MAG". Returns null for an unresolved "这个客户"
// with no actual name — never guesses which customer that refers to.
export function parseCustomerContextCommand(raw: string): string | null {
  const m = raw.trim().match(/^(.+?)\s*最近沟通到哪里了/u);
  if (!m) return null;
  const name = m[1].trim();
  if (!name || /^(?:这个|该)客户$/.test(name)) return null;
  return name;
}

export const CALENDAR_TODAY_RE = /今天.*(?:会议|日程|安排)|今天有什么会议/u;
export const CALENDAR_TOMORROW_RE = /明天.*(?:会议|日程|安排)/u;
export const CALENDAR_WEEK_RE = /(?:本周|这周).*(?:会议|日程|安排)/u;
export const IMPORTANT_EMAILS_RE = /重要邮件|需要我处理.*邮件|哪些邮件.*(?:处理|重要)/u;
export const CUSTOMER_CONTEXT_RE = /最近沟通到哪里了/u;
