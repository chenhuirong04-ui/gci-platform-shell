// GCI Executive Desk — Task 14.1: Ask GCI entry points for MIA status.
// All read-only — matching a phrasing here only triggers a getMiaStatus()
// fetch and a formatted display, never any MIA execution.
export function matchMiaStatusQuery(raw: string): boolean {
  const t = raw.trim();
  const PATTERNS: RegExp[] = [
    /mia.{0,4}(今天|今日).{0,6}(开发|新开发).{0,6}(客户|潜客)/i,
    /mia.{0,4}(今天|今日).{0,6}(联系|触达|contact)/i,
    /mia.{0,4}(有没有|是否|有).{0,6}(异常|出错|error|问题)/i,
    /mia.{0,4}(有|有没有).{0,6}(需要|要).{0,4}(我|chris).{0,4}(处理|决定)/i,
    /哪些.{0,4}mia.{0,4}leads?.{0,6}(值得|重点)/i,
    /mia.{0,10}leads?.{0,6}(值得|重点)/i,
    /今天.{0,4}(有没有|有多少).{0,6}(潜客|客户).{0,4}回复/i,
    /(今日|今天).{0,4}新开发.{0,4}潜客/i,
  ];
  return PATTERNS.some((re) => re.test(t));
}
