// ============================================================
// GCI Platform V2 — Central AI Intent Router
// ============================================================
// Replaces scattered keyword matching in AIPage.tsx.
// Call detectAIIntent(userInput) to get the best matching intent.

import { AI_CAPABILITY_MAP } from './aiCapabilityMap';
import type { AIIntent, AITab } from './aiCapabilityMap';

export interface AIIntentMatch {
  intent: AIIntent;
  /** 0–1 confidence score based on keyword overlap */
  confidence: number;
  /** Raw user input */
  raw: string;
  /** Known required fields that appear to be missing from the input */
  detectedMissingFields: string[];
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Each matched keyword adds to the score.
// Exact phrase match → +2.0, single token match → +1.0.
// Score is normalised to 0–1 by dividing by max possible score.

function scoreIntent(input: string, intent: AIIntent): number {
  const t = input.toLowerCase();
  let score = 0;

  for (const kw of intent.triggerKeywordsZh) {
    if (t.includes(kw.toLowerCase())) score += kw.length > 3 ? 2 : 1;
  }
  for (const kw of intent.triggerKeywordsEn) {
    if (t.includes(kw.toLowerCase())) score += kw.split(' ').length > 1 ? 2 : 1;
  }

  // Normalise: cap at 1.0 using the total possible keyword weight for this intent
  const maxScore = intent.triggerKeywordsZh.length * 2 + intent.triggerKeywordsEn.length * 2;
  return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
}

// ── Default fallback intent ────────────────────────────────────────────────────
// Used when no keyword matches. Routes to AI Chat in query mode.
const DEFAULT_INTENT: AIIntent = {
  intentId: 'generic_query',
  intentNameZh: '通用查询',
  intentNameEn: 'Generic Query',
  category: 'query',
  triggerKeywordsZh: [],
  triggerKeywordsEn: [],
  targetTab: 'chat' as AITab,
  targetModule: 'AI Chat',
  targetRoute: '',
  readSources: [],
  writeTargets: [],
  requiredFields: [],
  approvalRequired: false,
  resultPanel: null,
  implementationStatus: 'mock',
  notConnectedMessage: 'GCI AI 暂时无法理解这个指令。请尝试更具体的描述，例如：「帮我做一张发票」或「今天谁要跟进？」',
  fallbackBehavior: '显示通用提示，建议用户使用更具体的指令。',
};

// ── Main router function ───────────────────────────────────────────────────────

export function detectAIIntent(raw: string): AIIntentMatch {
  if (!raw.trim()) {
    return { intent: DEFAULT_INTENT, confidence: 0, raw, detectedMissingFields: [] };
  }

  // Score every intent
  const scored = AI_CAPABILITY_MAP.map(intent => ({
    intent,
    score: scoreIntent(raw, intent),
  }));

  // Pick highest score
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));

  // Only fall back to generic if NO intent matched any keyword at all (score === 0).
  // The old 0.05 threshold was too high: intents with many keywords get penalized by
  // normalization even when a keyword clearly matched (e.g. "库存" → 1/54 = 0.018).
  if (best.score === 0) {
    const isQuestion =
      raw.endsWith('?') || raw.endsWith('？') ||
      /哪些|谁|多少|什么|几|查|看/.test(raw);
    const fallback: AIIntent = {
      ...DEFAULT_INTENT,
      targetTab: isQuestion ? 'chat' : 'assistant',
    };
    return { intent: fallback, confidence: 0, raw, detectedMissingFields: [] };
  }

  // Detect obvious missing required fields by checking if input mentions them
  const detectedMissingFields = best.intent.requiredFields.filter(field => {
    // Simple heuristic — if a short key term appears in the input, consider it provided
    const fieldHint = field.replace(/_/g, ' ').toLowerCase();
    return !raw.toLowerCase().includes(fieldHint);
  });

  return {
    intent: best.intent,
    confidence: best.score,
    raw,
    detectedMissingFields,
  };
}

// ── Mock step sequences per intent ────────────────────────────────────────────
// Used by the CommandPanel animation for real/partial intents.
// Missing intents skip animation and go straight to "not connected" message.

export function getIntentSteps(intent: AIIntent): string[] {
  const stepMap: Record<string, string[]> = {
    create_invoice_draft: [
      '正在识别指令…', '已检测任务：创建发票草稿',
      '正在读取开票资料库…', '正在检查报价 / PI 数据…',
      '正在准备发票向导…',
    ],
    save_billing_profile: [
      '正在识别指令…', '已检测任务：保存开票资料',
      '正在检查重复资料…', '正在准备录入面板…',
    ],
    check_followups: [
      '正在识别指令…', '已检测任务：客户跟进查询',
      '正在连接 CRM 数据源…',
    ],
    check_quotation_followups: [
      '正在识别指令…', '正在连接报价数据库…',
      '正在过滤超时报价…',
    ],
    create_customer_draft: [
      '正在识别指令…', '已检测任务：新增客户',
      '正在连接 CRM 数据源…',
    ],
    check_inventory: [
      '正在识别指令…', '正在连接库存数据库…',
      '正在检查库存水位…',
    ],
    generate_daily_brief: [
      '正在读取 CRM 跟进…', '正在读取报价数据…',
      '正在读取发票状态…', '正在汇总简报…',
    ],
    classify_inbox_content: [
      '正在分析输入内容…', '正在识别内容类型…',
      '正在匹配目标模块…', '正在准备分类草稿…',
    ],
    create_quotation_draft: [
      '正在识别指令…', '已检测任务：创建报价单',
      '正在连接报价模块…', '正在准备报价向导…',
    ],
    payment_or_invoice_followup: [
      '正在识别指令…', '正在读取发票记录…',
      '正在检查付款状态…',
    ],
    create_pi_draft: [
      '正在识别指令…', '已检测任务：生成 PI',
      '正在连接 PI 数据库…', '正在准备 PI 向导…',
    ],
    check_cashflow: [
      '正在识别指令…', '正在读取财务流水…',
      '正在计算收支汇总…',
    ],
  };

  return stepMap[intent.intentId] ?? [
    '正在识别指令…', '正在分析需求…', '正在准备响应…',
  ];
}
