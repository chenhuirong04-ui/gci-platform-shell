import { GoogleGenAI } from "@google/genai";
import { CMOResponse, FollowUpTask, AIInsights, Attachment } from "../types";

const SYSTEM_INSTRUCTION = `
你现在是 iCare 首席成交官助理。你的任务是基于事实和附件内容生成最专业的跟进方案。
### 核心限制 (CRITICAL):
1. **身份立场**: 必须严格遵守用户指定的立场。
   - [SELLER]: 供应商。核心是成交、收款。
   - [BUYER]: 采购商。核心是压价、确认规格。
2. **多模态分析**: 如果提供了附件（图片/截图），请识别其中的价格、数量、规格、客户语气和潜在需求。
3. **输出结构**: 必须包含以下四个标记区块，并额外输出一个 JSON 格式的 AI 洞察分析。
【中文确认版】
(写给用户看的中文逻辑说明)
【最终发送版（中英双语）】
(发给客户的内容。中文段落后跟英文段落。)
【建议动作】
(一句话建议)
【风险提示】
(一句话风险)
【AI_INSIGHTS_JSON】
{
  "realNeed": "对客户真实意图的深度判断",
  "priceSensitivity": "高/中/低",
  "priority": "A/B/C",
  "nextActionSuggestion": "具体建议动作",
  "extractedFacts": "从附件和文字中提取的关键事实清单"
}
`;

function getApiKey(): string {
  // 优先用 VITE_ 前缀变量（Vite 原生保证注入，兼容 Vercel）
  // 其次兜底 process.env（本地开发 .env.local 仍可用旧 key 名）
  const key =
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    "";
  if (!key || key === "undefined" || key.trim() === "") {
    throw new Error(
      "GEMINI_API_KEY 未配置。请在 Vercel 环境变量里添加 VITE_GEMINI_API_KEY。"
    );
  }
  return key;
}

export const generateTaskContent = async (
  task: Partial<FollowUpTask>,
  correction?: string
): Promise<CMOResponse> => {

  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const promptText = `
立场: ${task.myRole}
客户: ${task.clientName}
跟进目标: ${task.goal}
最近情况: ${task.lastContext}
补充备注: ${(task as any).notes || "无"}
${correction ? `用户纠错反馈: ${correction}` : ""}
请根据以上事实和附件内容，生成专业话术。
  `.trim();

  const parts: any[] = [{ text: promptText }];

  const nonSupportedFiles: string[] = [];

  if (task.attachments && task.attachments.length > 0) {
    task.attachments.forEach((att) => {
      const isImage = att.type.startsWith("image/");
      const isPDF   = att.type === "application/pdf";

      if ((isImage || isPDF) && att.data) {
        const base64Data = att.data.includes(",") ? att.data.split(",")[1] : att.data;
        parts.push({
          inlineData: {
            mimeType: att.type,
            data: base64Data,
          },
        });
      } else if (att.data) {
        // Word / Excel / PPT 等格式无法直接传给 Gemini，记录文件名供提示词说明
        nonSupportedFiles.push(att.name);
      }
    });
  }

  if (nonSupportedFiles.length > 0) {
    parts.push({
      text: `\n[附件说明] 以下文件因格式限制无法直接读取内容，请结合上下文判断：${nonSupportedFiles.join("、")}`,
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 4000,  // 2000 会截断双语话术，导致正则无法匹配
    },
  });

  const text = response.text ?? "";
  console.log('[GeminiService] 原始响应 (前3000字):\n', text.slice(0, 3000));
  console.log('[GeminiService] 包含【中文确认版】:', text.includes('【中文确认版】'));
  console.log('[GeminiService] 包含【最终发送版', text.includes('【最终发送版'));
  console.log('[GeminiService] 包含【建议动作】:', text.includes('【建议动作】'));
  return parseResponse(text);
};

// ── 新增：从附件中提取结构化表单数据 ──────────────────────────────────────

export interface ExtractedFormData {
  recordType: string;
  customerName: string;
  countryOrCity: string;
  phone: string;
  whatsapp: string;
  email: string;
  relatedProject: string;
  summary: string;
  keyProducts: string;
  quantity: string;
  price: string;
  currency: string;
  nextAction: string;
  missingFields: string[];
}

const EXTRACT_SYSTEM_PROMPT = `
你是一个商业信息提取助手。用户会提供截图、图片或文件。
你的任务是从中提取结构化信息，只返回 JSON，不要任何其他文字、不要 markdown 代码块。

返回格式（严格遵守）：
{
  "recordType": "贸易询盘 | 项目推进 | 仅记录 | 内部事项",
  "customerName": "",
  "countryOrCity": "",
  "phone": "",
  "whatsapp": "",
  "email": "",
  "relatedProject": "",
  "summary": "",
  "keyProducts": "",
  "quantity": "",
  "price": "",
  "currency": "",
  "nextAction": "",
  "missingFields": []
}

【recordType 分类规则】
- 含产品需求、规格、材质、颜色、数量、询价、报价、采购 → 贸易询盘
- 含室内设计、装修方案、家具搭配、施工进度、项目周期、FF&E → 项目推进
- 含任务分配、内部流程、备忘、待办 → 内部事项
- 无法判断 → 仅记录

【summary 规则】
- summary 是必填字段，不能为空
- 无论截图是否包含联系信息，都必须把截图里的核心内容提炼为 1-3 句话写入 summary
- 重点提炼：客户需求、产品偏好、修改意见、关键决定、待确认事项

【其他字段规则】
- 能从截图中提取到的内容尽量填写，提取不到则留空字符串
- phone/whatsapp/email：只有截图里明确出现联系方式时才填写，否则留空
- price/currency：只有截图里明确出现价格数字时才填写，否则留空
- countryOrCity：只有截图里出现国家、城市、地区信息时才填写，否则留空

【missingFields 规则】
- missingFields 只列"截图中本应有但未能识别"的关键字段，用中文描述
- 以下情况不列入 missingFields：截图本身就是需求描述/设计方案/产品规格，没有联系方式、价格是正常的
- 以下情况才列入 missingFields：截图是对话记录但没提取到客户姓名、截图含价格但数字模糊无法读取
- 如果截图信息完整，missingFields 返回空数组 []
`.trim();

export const extractFormDataFromAttachments = async (
  attachments: Attachment[]
): Promise<ExtractedFormData> => {

  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const imageAttachments = attachments.filter((att) => att.type.startsWith("image/"));

  if (imageAttachments.length === 0) {
    throw new Error("当前附件中没有可识别的图片，请上传截图或图片文件");
  }

  const parts: any[] = [
    { text: "请识别以下图片中的信息并按要求返回 JSON：" },
  ];

  imageAttachments.forEach((att) => {
    const base64Data = att.data.includes(",") ? att.data.split(",")[1] : att.data;
    parts.push({
      inlineData: {
        mimeType: att.type,
        data: base64Data,
      },
    });
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: EXTRACT_SYSTEM_PROMPT,
      maxOutputTokens: 1500,
    },
  });

  const raw = (response.text ?? "").trim();

  // 用正则提取第一个 {...} 块，兼容模型在 JSON 前后加文字或 markdown 的情况
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`AI 未返回有效 JSON，请重试。原始内容：${raw.slice(0, 200)}`);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ExtractedFormData;
    return parsed;
  } catch {
    throw new Error(`AI 返回的内容无法解析为 JSON，请重试。原始内容：${raw.slice(0, 200)}`);
  }
};

// ── AI Operations Brief (全局运营日报) ────────────────────────────────────

export interface ClientBrief {
  clientName: string;
  currentStatus: string;
  lastContact: string;
  nextStep: string;
  suggestedPriority: 'A' | 'B' | 'C';
  suggestedMessage: string;
}

export interface OperationsBrief {
  summary: string;
  todayFollowUp: ClientBrief[];
  overdue: ClientBrief[];
  readyForQuotation: ClientBrief[];
  needMoreInfo: ClientBrief[];
  highPriority: ClientBrief[];
  potentiallyLost: ClientBrief[];
  generatedAt: string;
}

const OPS_SYSTEM = `
You are GCI's AI Operations Assistant — a daily operations briefing engine for a B2B trading company sourcing products from China for the Middle East.

You receive a list of TRADE leads. Your job is to categorize them and produce a structured daily operations brief.

Return ONLY a valid JSON object. No markdown. No extra text.

JSON format:
{
  "summary": "<2-3 sentence overall assessment of today's pipeline>",
  "todayFollowUp": [...],
  "overdue": [...],
  "readyForQuotation": [...],
  "needMoreInfo": [...],
  "highPriority": [...],
  "potentiallyLost": [...]
}

Each client entry:
{
  "clientName": "",
  "currentStatus": "",
  "lastContact": "<1 sentence summary of last known context>",
  "nextStep": "<specific action to take, not generic>",
  "suggestedPriority": "A|B|C",
  "suggestedMessage": "<1 short sentence to send client in English, push-oriented>"
}

Category rules:
- todayFollowUp: nextFollowUpAt <= today AND status not in [已成交, 已归档, 暂缓]
- overdue: nextFollowUpAt < today - 2 days AND status not in [已成交, 已归档]
- readyForQuotation: tradeStatus is 待报价 OR (has product + quantity + region info)
- needMoreInfo: tradeStatus is 需求整理中 OR missing key details
- highPriority: priority is A
- potentiallyLost: no activity implied for >7 days OR tradeStatus is 暂缓

A client can appear in multiple categories. Keep each list to max 8 entries.
`.trim();

export const generateOperationsBrief = async (
  tasks: FollowUpTask[]
): Promise<OperationsBrief> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const today = new Date().toISOString().slice(0, 10);

  // Compact task list — only essential fields, max 20 tasks to control tokens
  const taskLines = tasks
    .filter(t => t.status !== 'deleted' && t.status !== 'archived')
    .slice(0, 20)
    .map(t => ({
      clientName: t.clientName,
      tradeStatus: t.tradeStatus,
      priority: t.priority,
      goal: t.goal || (t as any).inquirySummary || '',
      lastContext: ((t.lastContext || (t as any).lastNote || '').slice(0, 150)),
      nextFollowUpAt: t.nextFollowUpAt?.slice(0, 10) || '',
      countryCity: t.countryCity || '',
    }));

  const prompt = `
Today: ${today}

TRADE leads to analyze (${taskLines.length} total):
${JSON.stringify(taskLines, null, 0)}

Produce the operations brief JSON.
`.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: OPS_SYSTEM,
      maxOutputTokens: 3000,
    },
  });

  const raw = (response.text ?? '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Operations Brief AI did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Omit<OperationsBrief, 'generatedAt'>;
  return { ...parsed, generatedAt: new Date().toISOString() };
};

// ── FB Inquiry Extractor ───────────────────────────────────────────────────

export interface FBInquiryResult {
  clientName: string;
  product: string;
  quantity: string;
  region: string;
  phone: string;
  whatsapp: string;
  email: string;
  currentStage: string;
  nextStep: string;
  suggestedReply: string;
  followUpNotes: string;
}

const FB_EXTRACT_SYSTEM = `
You are a B2B sales assistant for GCI (Global Care Info), a sourcing/trading company.
A user will paste raw Facebook / Marketplace chat text or inquiry text.
Extract structured lead information and return ONLY a valid JSON object. No markdown, no extra text.

JSON format:
{
  "clientName": "<buyer name or Facebook name, or 'Unknown FB Lead' if not found>",
  "product": "<product they want, as specific as possible>",
  "quantity": "<quantity or MOQ they mentioned, empty string if unknown>",
  "region": "<their country or city if mentioned, empty string if unknown>",
  "phone": "<phone number if mentioned, empty string if not>",
  "whatsapp": "<WhatsApp number if mentioned, empty string if not>",
  "email": "<email if mentioned, empty string if not>",
  "currentStage": "<one of: New Inquiry | Interested | Need More Info | Ready For Quotation>",
  "nextStep": "<one specific action to advance this lead, in Chinese>",
  "suggestedReply": "<short English reply to send them, 2-3 lines, professional, ends with a question to get more info>",
  "followUpNotes": "<1-3 sentence summary of the inquiry in Chinese, for Notion record>"
}
`.trim();

export const extractFBInquiry = async (chatText: string): Promise<FBInquiryResult> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `Facebook inquiry text:\n\n${chatText.slice(0, 3000)}` }] }],
    config: { systemInstruction: FB_EXTRACT_SYSTEM, maxOutputTokens: 800 },
  });

  const raw = (response.text ?? '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`AI 未返回有效 JSON，请重试。`);
  return JSON.parse(jsonMatch[0]) as FBInquiryResult;
};

// ── AI Sales Closer ────────────────────────────────────────────────────────

export type SalesStage =
  | 'New Inquiry'
  | 'Interested'
  | 'Need More Info'
  | 'Ready For Quotation'
  | 'Negotiation'
  | 'Won'
  | 'Lost';

export interface MissingField {
  field: 'product' | 'quantity' | 'region' | 'contact' | 'email' | 'company';
  label: string;
  hasValue: boolean;
  currentValue: string;
}

export interface SalesCloserResult {
  salesStage: SalesStage;
  suggestedTradeStatus: string;
  stageReason: string;
  missingFields: MissingField[];
  closingMessage: string;
  nextAction: string;
  nextFollowUpDate: string;
}

const STAGE_TO_TRADE_STATUS: Record<SalesStage, string> = {
  'New Inquiry':          '新询盘',
  'Interested':           '需求整理中',
  'Need More Info':       '需求整理中',
  'Ready For Quotation':  '待报价',
  'Negotiation':          '已报价待确认',
  'Won':                  '已成交',
  'Lost':                 '已归档',
};

const SALES_CLOSER_SYSTEM = `
You are an AI Sales Closer for GCI (Global Care Info), a B2B trading company sourcing products from China for the Middle East market.

Your ONLY goal: push the lead to "Ready For Quotation" as fast as possible.

You must return a single JSON object. No markdown. No extra text. Strict format:

{
  "salesStage": "<one of: New Inquiry | Interested | Need More Info | Ready For Quotation | Negotiation | Won | Lost>",
  "stageReason": "<one sentence explaining why this stage, based on facts only>",
  "closingMessage": "<English message to send to client, 3-5 lines max, ends with a clear call-to-action to get missing info or confirm quotation. No greetings like 'Hope you are well'. Direct and professional.>",
  "nextAction": "<one sentence: what to do next to advance this deal>",
  "nextFollowUpDate": "<YYYY-MM-DD, recommended follow-up date>"
}

Stage selection rules:
- New Inquiry: just received, no product detail yet
- Interested: client showed interest, some info but incomplete
- Need More Info: missing 2+ key fields (product/quantity/region/company)
- Ready For Quotation: have product + quantity + delivery region
- Negotiation: quotation sent, waiting for client decision
- Won: deal confirmed
- Lost: client stopped responding >14 days or explicitly declined

The closing message must:
- Be in English
- Ask for at most 1-2 missing pieces of information
- End with: "Once I have this, I can prepare a formal quotation for you right away."
- Never use filler phrases
`.trim();

export const generateSalesCloser = async (
  task: Partial<FollowUpTask>
): Promise<SalesCloserResult> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Detect missing fields from task data
  const missingFields: MissingField[] = [
    {
      field: 'product',
      label: '产品名称/规格',
      hasValue: !!(task.goal || (task as any).inquirySummary),
      currentValue: task.goal || (task as any).inquirySummary || '',
    },
    {
      field: 'quantity',
      label: '采购数量/MOQ',
      hasValue: /\d/.test(task.lastContext || '') || /\d/.test((task as any).lastNote || ''),
      currentValue: '',
    },
    {
      field: 'region',
      label: '目标地区/城市',
      hasValue: !!(task.countryCity),
      currentValue: task.countryCity || '',
    },
    {
      field: 'contact',
      label: '联系方式',
      hasValue: !!(task.whatsapp || task.phoneE164),
      currentValue: task.whatsapp || task.phoneE164 || '',
    },
    {
      field: 'email',
      label: '邮箱',
      hasValue: !!(task.email),
      currentValue: task.email || '',
    },
    {
      field: 'company',
      label: '公司名称',
      hasValue: !!(task.clientName && task.clientName !== '未命名' && task.clientName !== 'Unknown'),
      currentValue: task.clientName || '',
    },
  ];

  const missingList = missingFields
    .filter(f => !f.hasValue)
    .map(f => f.label)
    .join(', ');

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `
Client: ${task.clientName || 'Unknown'}
Country/City: ${task.countryCity || 'Unknown'}
Product Interest: ${task.goal || (task as any).inquirySummary || 'Not specified'}
Last Context: ${task.lastContext || (task as any).lastNote || 'None'}
Current Status: ${task.tradeStatus || 'New Inquiry'}
WhatsApp: ${task.whatsapp || 'None'}
Email: ${task.email || 'None'}
Missing fields: ${missingList || 'None'}
Today: ${today}

Analyze this lead and return the JSON.
`.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SALES_CLOSER_SYSTEM,
      maxOutputTokens: 1000,
    },
  });

  const raw = (response.text ?? '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Sales Closer AI did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Omit<SalesCloserResult, 'missingFields' | 'suggestedTradeStatus'>;
  const stage = parsed.salesStage as SalesStage;

  return {
    salesStage: stage,
    suggestedTradeStatus: STAGE_TO_TRADE_STATUS[stage] ?? '需求整理中',
    stageReason: parsed.stageReason,
    missingFields,
    closingMessage: parsed.closingMessage,
    nextAction: parsed.nextAction,
    nextFollowUpDate: parsed.nextFollowUpDate || today,
  };
};

// ── 原有解析函数，保持不变 ─────────────────────────────────────────────────

function parseResponse(text: string): CMOResponse {
  // 每个 section 的正则都用 (?=【...|$) lookahead 作为终止符
  // 这样即使响应被截断、下一个标记不存在，也能匹配到已有内容
  const zhMatch     = text.match(/【中文确认版】([\s\S]*?)(?=【最终发送版|$)/);
  const biMatch     = text.match(/【最终发送版[^】]*】([\s\S]*?)(?=【建议动作|【风险提示|【AI_INSIGHTS_JSON】|$)/);
  const actionMatch = text.match(/【建议动作】([\s\S]*?)(?=【风险提示|【AI_INSIGHTS_JSON】|$)/);
  const riskMatch   = text.match(/【风险提示】([\s\S]*?)(?=【AI_INSIGHTS_JSON】|$)/);
  const aiJsonMatch = text.match(/【AI_INSIGHTS_JSON】([\s\S]*)/);

  console.log('[parseResponse] zhMatch:', !!zhMatch, '| biMatch:', !!biMatch, '| actionMatch:', !!actionMatch);

  let aiInsights: AIInsights | undefined;
  if (aiJsonMatch) {
    try {
      const jsonStr = aiJsonMatch[1].trim().replace(/```json/g, "").replace(/```/g, "");
      aiInsights = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI Insights JSON", e);
    }
  }

  // 兜底：如果双语话术没解析到，但策略分析有内容，用策略内容作为基础话术
  const biContent = biMatch?.[1]?.trim();
  const zhContent = zhMatch?.[1]?.trim();
  const finalBilingual = biContent
    ? biContent
    : zhContent
    ? `【AI 已生成策略分析，话术内容请参考以下内容整理】\n\n${zhContent}`
    : "生成话术失败，请检查输入";

  return {
    draftZH:         zhMatch      ? zhMatch[1].trim()      : "解析中...",
    finalBilingual,
    suggestedAction: actionMatch  ? actionMatch[1].trim()  : "继续跟进",
    riskNotice:      riskMatch    ? riskMatch[1].trim()
                     : (text.match(/【风险提示】([\s\S]*)/)?.[1].trim() || "暂无"),
    aiInsights,
  };
}
