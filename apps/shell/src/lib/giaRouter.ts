// GCI Executive Desk — GIA shared top-input router.
// Extracted from BusinessAssistant.tsx's handleTopSubmit so the Home
// dashboard's GIA entry (BusinessAssistantEntry.tsx) and the full
// /business-assistant page call the EXACT SAME classification/dispatch
// chain instead of Home redirecting to the other page first. This is a
// relocation, not a rewrite — same functions, same order, same fallback
// rules as before. Writes still only ever happen via confirmCaptureItem()
// (lib/businessCapture.ts) after an explicit confirm click; nothing here
// writes anything itself.
import {
  classifyCapture, resolveCaptureItems,
  matchTaskLifecycleCommand, findOpenTasksByKeyword,
  matchTaskRescheduleCommand,
  detectExplicitDestination, resolveExplicitDestinationCapture,
  type ResolvedCaptureItem,
} from './businessCapture';
import { parseRelativeDateZh } from '../ai/crmAskGciParsers';
import {
  searchFileRegistryByQuery, searchDriveFallback, looksLikeFileSeek, extractCompanyName,
} from './giaFiles';
import { getChanyaStatus } from './chanya';
import { matchChanyaStatusQuery, formatChanyaStatusReply } from '../ai/chanyaAskGciParsers';
import {
  looksLikeMemoryQuery, queryBusinessMemoryByText, searchActiveBusinessMemory,
  type GiaBusinessMemoryRow,
} from './businessMemory';
import { matchWhatsAppQuery, answerWhatsAppQuery } from './whatsapp';
import { isPlannerV3Enabled, callPlannerV3, classifyPlanV3Actions } from './plannerV3';
import type { ExecutiveTask } from './executiveTasks';
import type { CrmCustomer } from './crmSupabase';

const CAPTURABLE = new Set(['NEW_CUSTOMER', 'CRM_FOLLOWUP', 'BUSINESS_TODO', 'COMMITMENT', 'DECISION', 'BUSINESS_MEMORY']);

export interface GiaRouterState {
  currentCustomer: CrmCustomer | null;
  setFileSearchReply: (v: string | null) => void;
  setPendingCapture: (v: ResolvedCaptureItem[] | null) => void;
  setCaptureLoading: (v: boolean) => void;
  setCaptureError: (v: string | null) => void;
  setCaptureDone: (v: Set<number>) => void;
  setPendingTaskLifecycle: (v: { action: 'completed' | 'cancelled'; matches: ExecutiveTask[] } | null) => void;
  setPendingTaskReschedule: (v: { whenPhrase: string; resolvedDate: string | null; matches: ExecutiveTask[] } | null) => void;
}

// Task 16 §18 — "肯尼亚保姆这个事情完成了。" Checked before capture
// classification since it's a lifecycle command on an EXISTING task, not
// new content to capture.
async function tryTaskLifecycleCommand(text: string, state: GiaRouterState): Promise<boolean> {
  const m = matchTaskLifecycleCommand(text);
  if (!m) return false;
  const res = await findOpenTasksByKeyword(m.keyword);
  if (!res.ok || res.matches.length === 0) return false;
  state.setPendingTaskLifecycle({ action: m.action, matches: res.matches });
  return true;
}

// GIA Foundation §A.4 — "SHADI这件事下周再提醒我". Only status-preserving
// date changes; checked alongside the lifecycle command since both are
// updates to an EXISTING task, not new content to capture.
async function tryTaskRescheduleCommand(text: string, state: GiaRouterState): Promise<boolean> {
  const m = matchTaskRescheduleCommand(text);
  if (!m) return false;
  const res = await findOpenTasksByKeyword(m.keyword);
  if (!res.ok || res.matches.length === 0) return false;
  const resolvedDate = parseRelativeDateZh(m.whenPhrase);
  state.setPendingTaskReschedule({ whenPhrase: m.whenPhrase, resolvedDate, matches: res.matches });
  return true;
}

// Task 17 §6 — "找Highway最新营业执照" / "客户要产品目录" / "找MAG的方案" /
// "Ray上次报价在哪里". Rule-based only (no AI call), and only "consumed"
// when a search actually returns a hit — an accidental keyword match on
// unrelated chat (e.g. bare "要") is harmless and falls through untouched
// to normal capture/AI handling, so this can never regress existing
// behavior on an empty or non-matching registry.
export async function tryFileSearch(text: string): Promise<string | null> {
  if (!looksLikeFileSeek(text)) return null;
  const registryHits = await searchFileRegistryByQuery(text);
  if (registryHits.length > 0) {
    const lines = registryHits.slice(0, 5).map((h) => `${h.is_current ? '✓ 当前版本' : '（旧版本）'} ${h.display_name} — ${h.drive_url}`);
    return `在 GIA 文件库中找到：\n${lines.join('\n')}`;
  }
  const driveHits = await searchDriveFallback(text);
  if (driveHits.length > 0) {
    const lines = driveHits.slice(0, 5).map((h) => `${h.name} — ${h.webViewLink}`);
    return `GIA 文件库中暂未登记，但在 Drive 中找到：\n${lines.join('\n')}`;
  }
  return null;
}

// Task 18.1 — "Chanya今天有多少新用户？" / "今天有人付款吗？" / "Chanya今天
// 收入多少？" / "有没有支付失败？" / "有没有用户需要我处理？" / "Chanya系统
// 有没有异常？". Read-only, always answers when the question is clearly
// about Chanya (unlike file search, no need to gate on a non-empty result —
// "not connected yet" is itself a valid, honest answer to show).
export async function tryChanyaStatusQuery(text: string): Promise<string | null> {
  if (!matchChanyaStatusQuery(text)) return null;
  const res = await getChanyaStatus();
  if (res.ok) return formatChanyaStatusReply(res.data, null);
  return formatChanyaStatusReply(null, res.error);
}

// GIA Foundation §B — Business Memory query: "Highway 劳务怎么算？" reads
// back a previously confirmed long-lived rule. Rule-based only (no AI
// call), only "consumed" when a known company name AND a rule-query
// phrasing are both present — same narrow-consumption pattern as file
// search, so it never hijacks unrelated chat.
function formatMemoryRows(rows: GiaBusinessMemoryRow[]): string {
  const lines = rows.map((r) => `【${r.title}】${r.content}${r.company_name ? `（适用主体：${r.company_name}）` : ''}`);
  return `Business Memory 中记录的规则：\n${lines.join('\n')}`;
}

export async function tryBusinessMemoryQuery(text: string): Promise<string | null> {
  if (!looksLikeMemoryQuery(text)) return null;
  const rows = await queryBusinessMemoryByText(text);
  if (rows.length === 0) {
    const company = extractCompanyName(text);
    return company
      ? `Business Memory 中暂未记录 ${company} 相关的规则。`
      : `Business Memory 中未找到匹配的规则（未识别出具体公司/主体名称）。`;
  }
  return formatMemoryRows(rows);
}

// GIA WhatsApp Intake V1 — "今天 WhatsApp 有什么要处理？" / "SHADI 最近
// WhatsApp 说了什么？" / "有哪些 WhatsApp 客户还没回复？". Reads only real
// rows already captured by api/whatsapp/webhook.ts — never fabricates.
export async function tryWhatsAppQuery(text: string): Promise<string | null> {
  const m = matchWhatsAppQuery(text);
  if (!m.kind) return null;
  return answerWhatsAppQuery(m.kind, m.customerName);
}

// GIA Foundation §C — "帮我给这个客户准备劳工报价": combine the currently
// loaded CRM customer + Business Memory (pricing rules) + File Registry
// (quote templates / licenses) into one answer. Never fabricates a
// number — surfaces exactly what's on file and calls out what's missing.
const QUOTE_PREP_TRIGGER_RE = /(准备|整理|出|做)(?:.{0,6})?(劳工|劳务|用工|人力)报价/u;

export async function tryQuotePrepCommand(text: string, customer: CrmCustomer | null): Promise<string | null> {
  if (!QUOTE_PREP_TRIGGER_RE.test(text)) return null;
  if (!customer) return '需要先在上方加载一个客户，才能为其准备劳工报价。';

  const pricingRows = await searchActiveBusinessMemory({ category: 'pricing' });
  const entity = pricingRows[0]?.company_name ?? null;

  const templateHits = await searchFileRegistryByQuery('劳务报价模板');
  const currentTemplate = templateHits.find((h) => h.is_current && (!entity || h.company_name === entity)) ?? templateHits.find((h) => h.is_current);

  const licenseHits = entity ? await searchFileRegistryByQuery(`${entity}营业执照`) : [];
  const currentLicense = licenseHits.find((h) => h.is_current);

  const missing: string[] = [];
  if (!entity) missing.push('应使用的公司主体（Business Memory 中暂无相关主体规则）');
  if (pricingRows.length === 0) missing.push('该客户所属业务的报价计算规则');
  if (!currentTemplate) missing.push('最新报价模板');
  if (entity && !currentLicense) missing.push(`${entity} 最新营业执照`);
  missing.push('人数、工种、合同期限等具体报价参数（需与客户确认）');

  const lines: string[] = [];
  lines.push(`客户：${customer.customer_name}${customer.country ? `（${customer.country}）` : ''}`);
  lines.push(`建议使用主体：${entity ?? '未在 Business Memory 中找到主体规则，需要你确认'}`);
  if (pricingRows.length > 0) {
    lines.push('当前报价规则：');
    pricingRows.forEach((r) => lines.push(`  【${r.title}】${r.content}`));
  } else {
    lines.push('当前报价规则：Business Memory 中暂无记录');
  }
  lines.push(`最新报价模板：${currentTemplate ? `${currentTemplate.display_name} — ${currentTemplate.drive_url}` : '未在文件库中找到'}`);
  if (entity) lines.push(`最新执照：${currentLicense ? `${currentLicense.display_name} — ${currentLicense.drive_url}` : '未在文件库中找到'}`);
  lines.push(`还缺：${missing.join('；')}`);
  return lines.join('\n');
}

// GIA 显式目的地指令 V1/V2 — Chris naming the destination ("进入我的待办" /
// "进入CRM[，新建客户/客户跟进/查询客户]" / "记住这个") outranks every other
// router below, including the bare-name customer-switch shortcut and the
// classifier's own type decision. Must run first, before anything else
// gets a chance to consume the input, in both entry points (top input +
// continuous chat).
// Return value: false = not consumed (caller falls through); true = a
// capture confirm card was shown (pendingCapture already set); string =
// a read-only CRM_QUERY reply the caller must display itself.
export async function checkExplicitDestination(text: string, state: GiaRouterState): Promise<boolean | string> {
  if (!detectExplicitDestination(text)) return false;
  state.setFileSearchReply(null);
  state.setCaptureLoading(true);
  state.setCaptureError(null);
  const resolved = await resolveExplicitDestinationCapture(text, state.currentCustomer);
  state.setCaptureLoading(false);
  if (!resolved) return false;
  if (resolved.kind === 'query') return resolved.reply;
  state.setCaptureDone(new Set());
  state.setPendingCapture(resolved.items);
  return true;
}

// GIA Action Planner V3 — STEP 2 minimal integration (feature-flagged,
// default OFF via VITE_GIA_PLANNER_V3_ENABLED / ?v3=1 override). Runs
// BEFORE the old classify-capture router below; the old router is left
// completely untouched as the fallback whenever the flag is off, the V3
// call fails, or V3's own action set can't be mapped. Writes still only
// happen via the existing confirmCaptureItem() after an explicit confirm
// click — V3 never writes directly.
export async function tryBusinessCaptureV3(text: string, state: GiaRouterState): Promise<boolean> {
  if (!isPlannerV3Enabled()) return false;
  const t = text.trim();
  if (!t) return false;

  const planned = await callPlannerV3(t, state.currentCustomer?.customer_name ?? null, null);
  if (!planned.ok || planned.actions.length === 0) return false; // fall back to old router

  const outcome = classifyPlanV3Actions(planned.actions, t);

  // Any action type V3 identified but this integration doesn't yet know
  // how to execute (CREATE_PROJECT / PREPARE_QUOTE / SUPPORT_ACTION) —
  // never partially execute; fall back to the old router for the whole
  // message rather than guessing which half to honor.
  if (outcome.unhandled.length > 0) return false;

  // Read-only answers (QUERY_DOCUMENT / BUSINESS_MEMORY_QUERY) — V3 has
  // already confirmed the intent, so call the real search functions
  // directly (bypassing the regex gates tryFileSearch/tryBusinessMemoryQuery
  // use for the old router) rather than fabricating a reply from entities.
  if (outcome.readOnlyActions.length > 0 && outcome.intents.length === 0) {
    const replies: string[] = [];
    for (const a of outcome.readOnlyActions) {
      if (a.action === 'QUERY_DOCUMENT') {
        const registryHits = await searchFileRegistryByQuery(t);
        if (registryHits.length > 0) {
          replies.push(`在 GIA 文件库中找到：\n${registryHits.slice(0, 5).map((h) => `${h.is_current ? '✓ 当前版本' : '（旧版本）'} ${h.display_name} — ${h.drive_url}`).join('\n')}`);
          continue;
        }
        const driveHits = await searchDriveFallback(t);
        if (driveHits.length > 0) {
          replies.push(`GIA 文件库中暂未登记，但在 Drive 中找到：\n${driveHits.slice(0, 5).map((h) => `${h.name} — ${h.webViewLink}`).join('\n')}`);
          continue;
        }
        replies.push('未在 GIA 文件库或 Drive 中找到匹配的文件。');
      } else if (a.action === 'BUSINESS_MEMORY_QUERY') {
        const rows = await queryBusinessMemoryByText(t);
        replies.push(rows.length > 0 ? formatMemoryRows(rows) : 'Business Memory 中未找到匹配的规则。');
      }
    }
    state.setFileSearchReply(replies.join('\n\n'));
    return true;
  }

  if (outcome.intents.length === 0) return false;

  state.setCaptureLoading(true);
  const resolved = await resolveCaptureItems(outcome.intents, state.currentCustomer);
  state.setCaptureLoading(false);
  if (resolved.length === 0) return false;

  // Honest-gap note (e.g. STORE_DOCUMENT with no real attachment) — shown
  // on the confirm card instead of a silent drop or a fake success.
  if (outcome.honestGapNotes.length > 0) {
    resolved[0] = { ...resolved[0], summaryLines: [...outcome.honestGapNotes.map((n) => `⚠ ${n}`), ...resolved[0].summaryLines] };
  }

  state.setCaptureDone(new Set());
  state.setPendingCapture(resolved);
  return true;
}

// Task 16 §三/§十二 — the unified router. Runs on both the top input
// (works with no customer loaded yet) and the chat box (works with a
// customer already loaded, so "他"/"这个客户" resolves via currentCustomer).
// Returns true if it consumed the input (capture flow shown or lookup
// fallback triggered) so callers skip their own default handling.
export async function tryBusinessCapture(text: string, state: GiaRouterState): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;

  if (await tryTaskLifecycleCommand(t, state)) return true;
  if (await tryTaskRescheduleCommand(t, state)) return true;

  state.setCaptureLoading(true);
  state.setCaptureError(null);
  const cls = await classifyCapture(t, state.currentCustomer?.customer_name ?? null);
  state.setCaptureLoading(false);
  if (!cls.ok) {
    state.setCaptureError(cls.error);
    return false;
  }
  const capturable = cls.intents.filter((it) => CAPTURABLE.has(it.type));
  if (capturable.length === 0) return false;

  const resolved = await resolveCaptureItems(capturable, state.currentCustomer);
  state.setCaptureDone(new Set());
  state.setPendingCapture(resolved);
  return true;
}

// A bare identifier with no punctuation/spaces ("MAG" / "TestCorpMAG16" /
// "Ray") is always a customer switch, never something to capture — even
// with a different customer already loaded, the classifier can otherwise
// mistake a short standalone name for a passing mention and swallow it
// into a content-free CRM_FOLLOWUP instead of switching context.
const BARE_NAME_RE = /^[^\s，。！？,.:：；;]{1,24}$/u;
// A bare, punctuation-free "建个客户" / "新建客户" / "登记客户" ask (no name
// stated) must reach the capture router so it can ask for the name,
// instead of being swallowed as a literal customer-name lookup.
const NEW_CUSTOMER_TRIGGER_RE = /(建|新建|登记|添加).{0,2}(一个|新)?.{0,2}客户/u;

// Everything AFTER the explicit-destination check: Task 17 file search,
// 18.1 Chanya status, Foundation §B memory query, WhatsApp intake,
// Foundation §C quote-prep, Planner V3, then the old classify-capture
// router. Exported separately (not folded into runGiaTopRouter) so
// handleSendWithContext (the continuous-chat box, /business-assistant page
// only) can run its own explicit-destination check + chat-specific draft
// parsers in between, exactly as it did before this extraction, without
// duplicating this chain.
export async function runGiaCaptureChain(text: string, state: GiaRouterState): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;

  const searchReply = await tryFileSearch(t);
  if (searchReply) { state.setFileSearchReply(searchReply); return true; }

  const chanyaReply = await tryChanyaStatusQuery(t);
  if (chanyaReply) { state.setFileSearchReply(chanyaReply); return true; }

  const memoryReply = await tryBusinessMemoryQuery(t);
  if (memoryReply) { state.setFileSearchReply(memoryReply); return true; }

  const whatsappReply = await tryWhatsAppQuery(t);
  if (whatsappReply) { state.setFileSearchReply(whatsappReply); return true; }

  const quotePrepReply = await tryQuotePrepCommand(t, state.currentCustomer);
  if (quotePrepReply) { state.setFileSearchReply(quotePrepReply); return true; }

  if (await tryBusinessCaptureV3(t, state)) return true;
  if (await tryBusinessCapture(t, state)) return true;

  return false;
}

// Runs the exact same chain BusinessAssistant.tsx's handleTopSubmit ran
// before this extraction. Returns true if the message was consumed (a
// reply or confirm card was shown via the state setters); false means
// "nothing matched — caller decides what a plain name/company lookup means
// for it" (the /business-assistant page calls its own resolve(); the Home
// dashboard entry navigates to /business-assistant?customer= instead,
// since it has no Customer-360 view of its own).
export async function runGiaTopRouter(text: string, state: GiaRouterState): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;

  // Pre-existing gap, fixed during V3 acceptance testing: a still-
  // unconfirmed capture card from a PREVIOUS message was never cleared
  // when a new, unrelated message came in — every fresh submission starts
  // clean.
  state.setFileSearchReply(null);
  state.setPendingCapture(null);
  state.setCaptureDone(new Set());
  state.setCaptureError(null);

  // 显式目的地指令永远最先检查 — 在 BARE_NAME_RE 等一切其他判断之前，
  // 确保不会被其他 Router 抢走。
  const explicitResult = await checkExplicitDestination(t, state);
  if (explicitResult === true) return true;
  if (typeof explicitResult === 'string') { state.setFileSearchReply(explicitResult); return true; }

  // A bare-looking string ("SHADI这件事下周再提醒我" / "帮我给这个客户准备劳工报价")
  // can still be a task lifecycle/reschedule/quote-prep command with no
  // spaces or listed punctuation — check those first so they aren't
  // swallowed as a customer-name switch.
  if (
    BARE_NAME_RE.test(t) &&
    !matchTaskLifecycleCommand(t) &&
    !matchTaskRescheduleCommand(t) &&
    !QUOTE_PREP_TRIGGER_RE.test(t) &&
    !NEW_CUSTOMER_TRIGGER_RE.test(t)
  ) {
    return false;
  }

  return runGiaCaptureChain(t, state);
}
