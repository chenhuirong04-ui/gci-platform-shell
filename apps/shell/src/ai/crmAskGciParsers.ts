// GCI Executive Desk — Ask GCI CRM natural-language parsers (Task 3).
// Pure functions, no side effects. Deterministic regex-based extraction —
// no fuzzy/auto-guess matching per Task 3 safety rules.

// Sunday-based weekday index (matches JS Date#getDay()): 日/天=0 … 六=6.
const WEEKDAY_MAP: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

// Formats using LOCAL date components (not toISOString(), which is UTC and
// rolls back a day in any positive-UTC-offset timezone — e.g. Dubai, UTC+4 —
// once `today` has been normalized to local midnight via setHours(0,0,0,0)).
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday-start week index for a date: Mon=0 … Sun=6.
// getDay() is Sunday-start (Sun=0); Chinese week semantics are Monday-start
// (周一 opens the week, 周日 closes it) — this conversion is what "下周/本周"
// need and what the original bug omitted.
function mondayBasedIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function startOfWeekMonday(d: Date): Date {
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayBasedIndex(d));
  return monday;
}

// Parses simple Chinese relative date phrases: 今天/明天/后天/本周X/下周X/下一个周X/周X/N天后/YYYY-MM-DD.
// Returns null when no recognizable date phrase is found (never guesses).
export function parseRelativeDateZh(text: string, ref: Date = new Date()): string | null {
  const s = text.trim();
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);

  if (/明天/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 1); return fmt(d); }
  if (/后天/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 2); return fmt(d); }
  if (/今天/.test(s)) return fmt(today);

  // "下周X" — the named weekday of the NEXT Monday-start calendar week
  // (always 7–13 days out; anchored to next week's Monday, never "nearest occurrence").
  const nextWeekM = s.match(/下\s*(?:个)?\s*周([一二三四五六日天])/);
  if (nextWeekM) {
    const monBasedTarget = (WEEKDAY_MAP[nextWeekM[1]] + 6) % 7;
    const monday = startOfWeekMonday(today);
    const d = new Date(monday);
    d.setDate(monday.getDate() + 7 + monBasedTarget);
    return fmt(d);
  }

  // "本周X"/"这周X" — the named weekday within the CURRENT Monday-start
  // calendar week (may be earlier than today — that's the literal meaning).
  const thisWeekM = s.match(/(?:本|这)\s*(?:个)?\s*周([一二三四五六日天])/);
  if (thisWeekM) {
    const monBasedTarget = (WEEKDAY_MAP[thisWeekM[1]] + 6) % 7;
    const monday = startOfWeekMonday(today);
    const d = new Date(monday);
    d.setDate(monday.getDate() + monBasedTarget);
    return fmt(d);
  }

  // "下一个周X" — nearest FUTURE occurrence (never today), same rule as bare "周X" below.
  const nextOccurrenceM = s.match(/下一个\s*周([一二三四五六日天])/);
  if (nextOccurrenceM) {
    const target = WEEKDAY_MAP[nextOccurrenceM[1]];
    const d = new Date(today);
    const cur = d.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return fmt(d);
  }

  // Bare "周X" (no 本/下/下一个 prefix) — nearest FUTURE occurrence, never today.
  const bareWeekM = s.match(/周([一二三四五六日天])/);
  if (bareWeekM) {
    const target = WEEKDAY_MAP[bareWeekM[1]];
    const d = new Date(today);
    const cur = d.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return fmt(d);
  }

  const daysLaterM = s.match(/(\d+)\s*天(?:之)?后/);
  if (daysLaterM) { const d = new Date(today); d.setDate(d.getDate() + Number(daysLaterM[1])); return fmt(d); }

  const isoM = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoM) return `${isoM[1]}-${isoM[2].padStart(2, '0')}-${isoM[3].padStart(2, '0')}`;

  return null;
}

// "查一下 MAG" / "查 MAG 的资料" → "MAG". Returns null when no explicit query
// trigger is present, or when the extracted text looks like it belongs to a
// different intent (inventory/quotation/supplier/invoice keywords).
const NON_CUSTOMER_KEYWORDS = /库存|报价|发票|供应商|寄售|应收|订单|付款|结算|invoice|inventory|stock|supplier|quotation/i;

export function parseQueryCustomerCommand(raw: string): string | null {
  const clean = raw.trim();
  const m = clean.match(/^(?:查一下|查询一下|查下|看一下|看看|查客户|查询客户|customer\s*info|look\s*up\s*customer)\s*[:：]?\s*(.+)$/iu);
  if (!m) return null;
  let name = m[1]
    .replace(/[。.!！]+$/g, '')
    .replace(/\s*(?:的)?\s*(?:客户资料|资料|信息|档案)\s*$/u, '')
    .trim();
  if (!name || name.length > 40) return null;
  if (NON_CUSTOMER_KEYWORDS.test(name)) return null;
  return name;
}

// "记录 Ahmed 今天的沟通：需要80个工人，下周二跟进。"
export function parseLogFollowupCommand(raw: string): {
  customerName: string;
  notes: string;
  nextAction: string;
  nextFollowUpAt: string | null;
  method: string | null;
} {
  const clean = raw.trim();
  const m = clean.match(/^(?:记录|log)\s*(.+?)\s*(?:今天|昨天)?\s*的?\s*(?:沟通|跟进记录|通话|communication)\s*[：:]\s*(.+)$/iu);
  const customerName = (m?.[1] || '').trim();
  const body = (m?.[2] || clean).trim().replace(/[。.]$/, '');

  const nextFollowUpAt = parseRelativeDateZh(body);

  let nextAction = '';
  const parts = body.split(/[，,]/).map((p) => p.trim()).filter(Boolean);
  const actionPart = parts.find((p) => /跟进|回复|确认|发送|安排|follow/i.test(p));
  if (actionPart) nextAction = actionPart;

  const methodM = body.match(/whatsapp|wechat|微信|email|电话|call|面谈|face to face/iu);
  const method = methodM ? methodM[0] : null;

  return { customerName, notes: body, nextAction, nextFollowUpAt, method };
}

// "新建客户 MAG，联系人XXX，WhatsApp XXX。"
export function parseCreateCrmCustomerCommand(raw: string): {
  customerName: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
} {
  const clean = raw.trim().replace(/[。.]$/, '');
  const m = clean.match(/^(?:新建客户|新增客户CRM|创建客户|录入客户|create customer|new customer)\s*[：:]?\s*([^，,]+)/iu);
  const customerName = (m?.[1] || '').trim();

  const contactM = clean.match(/联系人\s*[：:]?\s*([^，,]+)/u);
  const contactName = contactM?.[1]?.trim() || '';

  const waM = clean.match(/(?:whatsapp|wa)\s*[：:]?\s*(\+?[\d\s()-]{6,20})/iu);
  const whatsapp = waM?.[1]?.trim() || '';

  const phoneM = clean.match(/(?:电话|phone|tel|手机)\s*[：:]?\s*(\+?[\d\s()-]{6,20})/iu);
  const phone = phoneM?.[1]?.trim() || '';

  const emailM = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailM?.[0]?.trim() || '';

  return { customerName, contactName, phone, whatsapp, email };
}
