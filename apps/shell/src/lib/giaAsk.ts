// Home GIA → LLM tool answers (POST /api/gia/ask, GIA P2 phase 1).
//
// Order in BusinessAssistantEntry.go(): follow-up note → pending file →
// pending folder name → /ai forward (inventory etc., unchanged) → THIS →
// runGiaTopRouter → customer lookup. Only free-text business QUESTIONS reach
// the LLM: explicit commands (giaAiForward's isGiaExplicitCommand) never do,
// and a plain name such as "SHADI" has no question cue, so it still opens
// the customer card exactly as before. If the server can't answer
// (model failure, no suitable tool) the caller continues the existing flow.
import { isGiaExplicitCommand } from './giaAiForward';
import { matchChanyaStatusQuery } from '../ai/chanyaAskGciParsers';
import { looksLikeMemoryQuery } from './businessMemory';
import { matchWhatsAppQuery } from './whatsapp';

// GIA's existing narrow read-only answers (giaRouter.runGiaCaptureChain) keep
// their questions: same predicates those branches use, plus the quote-prep
// trigger. Service-knowledge (catalog / labour rates) has a broad gate
// ("多少") and only answers on a real catalog hit, so Home runs it right
// before the LLM instead (BusinessAssistantEntry.go()).
const QUOTE_PREP_TRIGGER_RE = /(准备|整理|出|做)(?:.{0,6})?(劳工|劳务|用工|人力)报价/u;
function isExistingGiaAnswer(text: string): boolean {
  return (
    matchChanyaStatusQuery(text) ||
    looksLikeMemoryQuery(text) ||
    !!matchWhatsAppQuery(text).kind ||
    QUOTE_PREP_TRIGGER_RE.test(text)
  );
}

// A question mark, or a question word / phrase. A bare name has none of these.
const QUESTION_CUE_RE = /[?？]|什么|多少|几[个家单件包天次位条笔]?|怎么|怎样|如何|哪|吗|呢|有没有|是不是|是否|情况|为什么|要处理|欠|\b(?:what|how|which|who|when|why|any|list|show)\b/iu;

export function giaAskEligible(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 500) return false;
  if (isGiaExplicitCommand(t)) return false;
  if (isExistingGiaAnswer(t)) return false;
  return QUESTION_CUE_RE.test(t);
}

export interface GiaAskToolUse { tool: string; args: Record<string, string>; status: number | string }
export interface GiaAskAnswer {
  answer: string;
  sources: string[];
  toolsUsed: GiaAskToolUse[];
  unverifiedNumbers: string[];
  capped: boolean;
}

export const GIA_ASK_CLIENT_TIMEOUT_MS = 45000;

/** The card shows plain text: drop Markdown emphasis/headings, list markers → "•". */
export function giaPlainText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .split('\n')
    .map((line) => line
      .replace(/^(\s*)#{1,6}\s+/, '$1')
      .replace(/^(\s*)[*-]\s+/, (_m, sp: string) => `${sp.length >= 2 ? '   ' : ''}• `))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The answer, or null → caller continues its existing routing. Never throws. */
export async function askGia(question: string, fetchImpl: typeof fetch = fetch): Promise<GiaAskAnswer | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), GIA_ASK_CLIENT_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl('/api/gia/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    if (!data?.ok || typeof data.answer !== 'string' || !data.answer.trim()) return null;
    return {
      answer: giaPlainText(data.answer),
      sources: Array.isArray(data.sources) ? data.sources : [],
      toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : [],
      unverifiedNumbers: Array.isArray(data.unverifiedNumbers) ? data.unverifiedNumbers : [],
      capped: !!data.capped,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
