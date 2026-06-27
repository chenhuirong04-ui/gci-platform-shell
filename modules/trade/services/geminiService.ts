import { GoogleGenAI, Type } from "@google/genai";

/**
 * Key fixes required by Chris:
 * - Company name must be: GLOBALCARE INFO GENERAL TRADING FZCO (GENERAL, not GENREAL)
 * - Invoice title must be: PERFORMANCE INVOICE (not Proforma)
 * - Must export extractItemsFromChat to match OrderConverter import
 */

const SYSTEM_INSTRUCTION_MARKDOWN = `
你是 iCare 的外贸单证专家。你的核心任务是解析贸易聊天记录并输出 **Performance Invoice（可计 VAT）** 的 Markdown 发票正文。

【必须严格使用以下固定信息，不允许出现旧版本】
- Company Name: GLOBALCARE INFO GENERAL TRADING FZCO（注意是 GENERAL，不是 GENREAL）
- Document Title: PERFORMANCE INVOICE（禁止输出 Proforma Invoice / PROFORMA INVOICE）
- Currency: AED
- VAT: 5%（必须计算并展示）

【核心逻辑】
1) 从聊天内容提取：客户名称、产品名称、数量、单价
   - 客户缺失：用 VALUED CLIENT
2) 计算：
   - Subtotal = Σ(qty * unit price)
   - VAT (5%) = Subtotal * 0.05
   - Grand Total = Subtotal + VAT
3) 自动补全：
   - 日期缺失：用今天日期（YYYY/MM/DD）
   - 单号缺失：PI-YYYYMMDD-01（同天多单递增 -02, -03）
4) 输出必须可打印：只输出发票正文，不要解释说明

【输出格式（严格照做，不要包代码块）】
GLOBALCARE INFO GENERAL TRADING FZCO
PERFORMANCE INVOICE
Date: YYYY/MM/DD
Invoice No: PI-YYYYMMDD-01

Bill To: 客户名称（或 VALUED CLIENT）

| Description | Qty | Unit Price (AED) | Total (AED) |
|---|---:|---:|---:|
| ... | ... | ... | ... |

Subtotal (AED): xxx.xx
VAT 5% (AED): xxx.xx
Grand Total (AED): xxx.xx

【约束】
- 所有数字保留两位小数
- 若缺少 qty 或 unit price：默认为 1；Description 保留原文线索；不要留空
`;

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    customer: { type: Type.STRING, description: "Customer name or 'Valued Client'" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          desc: { type: Type.STRING, description: "Product description" },
          price: { type: Type.NUMBER, description: "Unit price" },
          qty: { type: Type.NUMBER, description: "Quantity" },
        },
        required: ["desc", "price", "qty"],
      },
    },
  },
  required: ["customer", "items"],
} as const;

/**
 * IMPORTANT for Vite:
 * - Frontend env vars should be VITE_*
 * - We support both VITE_API_KEY and API_KEY for compatibility
 */
function getApiKey(): string {
  const viteKey =
    (import.meta as any)?.env?.VITE_API_KEY ||
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
    (import.meta as any)?.env?.VITE_GOOGLE_API_KEY;

  const nodeKey = (process as any)?.env?.API_KEY;

  const key = (viteKey || nodeKey || "").trim();
  if (!key) throw new Error("API Key is missing. Please set VITE_API_KEY (recommended) or API_KEY.");
  return key;
}

export const generateInvoiceFromText = async (text: string): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: text,
    config: { systemInstruction: SYSTEM_INSTRUCTION_MARKDOWN },
  });

  return response.text || "";
};

/**
 * MUST be exported with this exact name.
 * OrderConverter.tsx imports { extractItemsFromChat }.
 */
export const extractItemsFromChat = async (
  text: string
): Promise<{ customer: string; items: { desc: string; price: number; qty: number }[] }> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract order details from this chat log: ${text}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
    },
  });

  return JSON.parse(response.text || "{}");
};

export const parseFinancialDocument = async (
  imageBase64: string,
  mimeType: string
): Promise<{ amount: number; date: string; note: string; type: "in" | "out" }> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: "Analyze this financial image. Return strictly JSON with amount, date (YYYY-MM-DD), note, and type ('in'/'out')." },
      ],
    },
    config: { responseMimeType: "application/json" },
  });

  return JSON.parse(response.text || "{}");
};
