// GCI Executive Desk — Task 12: Ask GCI entry points into Business Assistant.
// A single thin extractor, not one parser per phrasing — every match just
// carries the customer name + the original text into /business-assistant,
// where the existing business context resolver + chat decide what to do.
// Pure regex matching only; no writes happen here.
export interface BusinessAssistantMatch {
  name: string;
  hint: string; // original text, prefilled into the Business Assistant chat
}

const PATTERNS: RegExp[] = [
  /^帮我看看\s*(.+?)\s*[。.!！]?$/u,
  /^(.+?)\s*现在什么情况[？?]?$/u,
  /^(.+?)\s*最近有什么进展[？?]?$/u,
  /^(.+?)\s*上次报价多少[？?]?$/u,
  /^(.+?)\s*的文件在哪里[？?]?$/u,
  /^(.+?)\s*最近有没有邮件[？?]?$/u,
  /^我下一步要怎么跟\s*(.+?)\s*[？?]?$/u,
  /^记录一下[:：]?\s*(?:刚才)?(?:和|跟)\s*(.+?)\s*(?:沟通|聊)/u,
  /提醒我(?:跟|联系|跟进)\s*(.+?)\s*[。.!！]?$/u,
  /^帮我写(?:一条)?\s*whatsapp\s*给\s*(.+?)\s*[。.!！]?$/iu,
];

const NON_CUSTOMER_KEYWORDS = /^(?:库存|报价|发票|供应商|寄售|应收|订单|付款|结算)$/i;

export function matchBusinessAssistantQuery(raw: string): BusinessAssistantMatch | null {
  const t = raw.trim();
  if (!t) return null;
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (m && m[1]) {
      const name = m[1].trim().replace(/["""''「」]/g, '');
      if (name.length >= 1 && name.length <= 40 && !NON_CUSTOMER_KEYWORDS.test(name)) {
        return { name, hint: t };
      }
    }
  }
  return null;
}
