// GCI Executive Desk — GIA → existing Notion "Follow-up Log跟进记录" database.
// Deliberately writes ONLY to the existing Follow-up Log (via a new minimal
// API route, api/crm/gia-followup-log.ts) — no Supabase crm_followups, no
// second Notion database, no SB Pool involvement (that's notion-write-lead.ts's
// job for real trade leads with a formal SB customer id; this is a lighter
// "just log what was said" path that never requires a customer to already
// exist anywhere first). Field names / select option values below are taken
// directly from the real, already-working Notion write endpoints
// (notion-write-lead.ts, notion-update-followup.ts, notion-create-followup-only.ts)
// — not guessed.

export interface ParsedNotionFollowup {
  customerName: string;
  followUpDateToday: string; // Follow-up Date（跟进日期） — always today
  method: string | null; // Follow-up Method（跟进方式）
  notes: string; // Follow-up Notes（跟进内容）
  status: string | null; // 行动状态
  businessType: string | null; // 业务类型
  nextFollowUpAt: string | null; // Next Follow-up（下次跟进） — only when a concrete date was resolvable
  nextAction: string | null; // 下次行动内容
  owner: string | null; // Follow-up Owner（负责人）
}

// GCI operates on Asia/Dubai (UTC+4) — same +4h shift used elsewhere
// (crmSupabase.ts's todayISO, businessDocumentHistory.ts's todayISO).
function todayISODubai(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Gate for entering this flow at all — deliberately literal phrase matching
// (not soft NLP intent detection), same discipline as every other trigger
// added this session. Checked before ANY other routing (file-pending flows,
// Business Document History, Planner/classify-capture) so a follow-up note
// never turns into a BUSINESS_TODO or gets swallowed by an unrelated intent.
const TRIGGER_RE = /记录跟进|记录沟通|记一下|记下来|先记|这个客户今天|follow[\s-]?up|log[\s-]?follow-up/i;

export function looksLikeNotionFollowupCommand(text: string): boolean {
  return TRIGGER_RE.test(text);
}

function cleanCandidate(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  return v.length >= 2 ? v : null;
}

// Ordered fallbacks, most explicit first. "跟/和/与 X <verb>" and "跟/和/与
// <CapitalizedToken>" cover both a descriptive Chinese sentence ("跟ZIMO蒲总
// 沟通") and a bare name-only mention ("跟SHADI") without a following verb —
// Chinese has no word spaces, so an ALL-CAPS/capitalized token is the only
// unambiguous boundary available when there's no verb cue.
function extractFollowupCustomerName(text: string): string | null {
  let m = text.match(/(?:记录跟进|记录沟通)[：:]\s*([^\s，,。]{1,20})/);
  let v = cleanCandidate(m?.[1]);
  if (v) return v;
  m = text.match(/(?:跟|和|与)\s*([^\s，,。]{1,20}?)\s*(?:沟通|联系|聊|确认|说|反馈|问)/);
  v = cleanCandidate(m?.[1]);
  if (v) return v;
  m = text.match(/(?:跟|和|与)\s*([A-Z][A-Za-z0-9]{1,20})/);
  v = cleanCandidate(m?.[1]);
  if (v) return v;
  m = text.match(/^([^\s，,。]{1,20}?)(?:今天|昨天|刚才)/);
  v = cleanCandidate(m?.[1]);
  if (v) return v;
  return null;
}

function extractMethod(text: string): string | null {
  if (/whatsapp/i.test(text)) return 'whatsapp';
  if (/微信|wechat/i.test(text)) return 'wechat';
  if (/邮件|email/i.test(text)) return 'email';
  if (/电话|call\b/i.test(text)) return 'call';
  if (/当面|面谈|face to face/i.test(text)) return 'face to face';
  return null;
}

function inferStatus(text: string): string | null {
  if (/询盘|问了|问价/.test(text)) return '新询盘';
  if (/合同.*(内部确认|审批|待签|签署)/.test(text) || /\bcontract\b/i.test(text)) return '合同待签';
  if (/已报价|报价.*(确认|回复|回应)/.test(text)) return '已报价待确认';
  if (/需求.*(整理|梳理)/.test(text)) return '需求整理中';
  if (/待报价|需要报价/.test(text)) return '待报价';
  if (/执行中|进行中|已成交|签约/.test(text)) return '执行中';
  if (/暂缓|搁置|延后/.test(text)) return '暂缓';
  return null;
}

function inferBusinessType(text: string): string | null {
  if (/合同|项目|工程/.test(text) || /\bproject\b/i.test(text)) return '项目型';
  if (/报价|询盘|价格|贸易|钢筋|材料|产品/.test(text)) return '贸易型';
  return null;
}

const OWNER_SET = ['lili', 'Chris', 'novie'];
function matchOwnerName(raw: string | undefined): string | null {
  if (!raw) return null;
  return OWNER_SET.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? null;
}
function extractOwner(text: string): string | null {
  const explicit = text.match(/负责人[:：]?\s*(lili|Chris|novie)/i);
  const named = matchOwnerName(explicit?.[1]);
  if (named) return named;
  const bare = text.match(/\b(lili|Chris|novie)\b/i);
  return matchOwnerName(bare?.[1]);
}

// "明天/后天/N天后" resolve to a real date. "下周"/"下个月"/"过几天" etc are
// deliberately left unresolved — the explicit business rule this round is
// never to invent a specific date from a vague relative phrase.
function resolveNextFollowUpDate(text: string, today: string): string | null {
  if (/明天/.test(text)) return addDaysISO(today, 1);
  if (/后天/.test(text)) return addDaysISO(today, 2);
  const m = text.match(/(\d+)\s*天[后後]/);
  if (m) return addDaysISO(today, Number(m[1]));
  return null;
}

// Deliberately excludes a bare "跟进" cue — it's part of the trigger phrase
// itself ("记录跟进：...") and of the "Next Follow-up（下次跟进）" field name
// text elsewhere, so including it here would match those instead of an
// actual next-step clause (found via a dry-run false-positive on case 1
// before this fix, matching "记录跟进：ZIMO蒲总" as if it were the next action).
function extractNextAction(text: string): string | null {
  const m = text.match(/([^，,。！!]{0,30}(?:继续跟|再跟|提醒我|再问|再联系)[^，,。！!]{0,20})/);
  if (m) return m[0].trim();
  if (/下周/.test(text)) return '下周继续跟进';
  return null;
}

// Deterministic only, no AI/OCR — every field comes straight from the
// user's own typed sentence. customerName falling back to a raw-text slice
// (rather than blocking) mirrors businessDocumentHistory.ts's same choice:
// a weak name just means the confirm card shows something the user can
// correct via "修改", never a blocked flow.
export function parseNotionFollowup(text: string): ParsedNotionFollowup | null {
  if (!looksLikeNotionFollowupCommand(text)) return null;
  const today = todayISODubai();
  const customerName = extractFollowupCustomerName(text) || text.trim().slice(0, 40);
  return {
    customerName,
    followUpDateToday: today,
    method: extractMethod(text),
    notes: text.trim(),
    status: inferStatus(text),
    businessType: inferBusinessType(text),
    nextFollowUpAt: resolveNextFollowUpDate(text, today),
    nextAction: extractNextAction(text),
    owner: extractOwner(text),
  };
}

export async function createNotionFollowupLog(
  input: ParsedNotionFollowup,
): Promise<{ ok: true; pageId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/crm/gia-followup-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'Notion write failed' };
    return { ok: true, pageId: data.pageId };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
