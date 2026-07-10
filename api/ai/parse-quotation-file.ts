// /api/ai/parse-quotation-file
// POST { mimeType: string, data: string (base64 or dataURL), fileName?: string }
// Sends PDF / image to Gemini (server-side only — key never exposed to browser).
// Returns parsed quotation items in a format ready for AIIntakePanel lineItems[].
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const PARSE_PROMPT = `You are a quotation document parser. Extract all product line items from this document.

Return ONLY valid JSON — no markdown fences, no explanation text. Use exactly this schema:
{
  "customerName": "string or null",
  "grandTotal": number or null,
  "currency": "AED",
  "items": [
    {
      "item_name": "product / furniture / material name",
      "description": "specification, size, or model — null if absent",
      "qty": number or null,
      "unit": "unit of measure (pc, set, m2, etc.) — null if absent",
      "selling_price": unit price as number or null,
      "line_total": line subtotal as number or null,
      "item_notes": "delivery lead time, remarks, or other notes — null if absent"
    }
  ],
  "confidence": "high" | "medium" | "low",
  "warnings": ["list any data quality issues, e.g. blurry columns, missing prices"]
}

Rules:
- Extract EVERY product row, including rows with missing prices.
- SKIP header rows and grand-total / subtotal summary rows.
- selling_price is the unit price per single item.
- line_total = qty × selling_price (or as shown). Compute if not shown and both values are present.
- grandTotal is the total amount for the entire document.
- Default currency to AED if not specified.
- If a numeric value cannot be read, use null — never guess.
- confidence: "high" if all key columns (name, qty, price) are clearly visible; "low" if many values unclear.`;

// Models tried in order. gemini-2.0-flash is more widely available than 2.5-flash.
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
];

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'Gemini API not configured on server' }, 500);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { mimeType, data, fileName, mode } = body;
  if (!mimeType || !data) return json({ ok: false, error: 'Missing required fields: mimeType, data' }, 400);

  const isImage = (mimeType as string).startsWith('image/');
  const isPdf   = mimeType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({
      ok: false,
      error: `不支持的文件类型: ${mimeType}。此接口仅处理 PDF 和图片，Excel 请用前端 xlsx 解析。`,
    }, 400);
  }

  // Strip data URL prefix (data:image/jpeg;base64,<actual_base64>)
  const base64 = typeof data === 'string' && data.includes(',') ? data.split(',')[1] : data;

  // mode='text_only': extract raw text for chat screenshots — no structured parsing
  const TEXT_ONLY_PROMPT = `Extract all visible text from this image exactly as it appears.
Return the raw text content only — no JSON, no formatting, no analysis.
Preserve line breaks. If the image contains a chat conversation, extract all message text.`;

  // mode='chat_extract_cn': extract text AND produce structured Chinese CRM summary in one call.
  // Returns JSON: { rawText, chineseSummary }
  const CHAT_EXTRACT_CN_PROMPT = `You are processing a WhatsApp/chat screenshot for GCI, a Middle East B2B platform.

Do TWO things in one response:
1. Extract all visible text from the image exactly as shown.
2. Produce a structured Chinese summary for internal CRM records.

Return ONLY valid JSON (no markdown fences):
{
  "rawText": "<all extracted text in original language, preserve line breaks>",
  "chineseSummary": "<structured Chinese CRM summary — see format rules below>"
}

Chinese summary format rules:
- Language: Chinese for all descriptions, labels, action items
- Preserve in English: place names (Jebel Ali, Al Warsan, Dubai, etc.), currency units (AED, SAR, USD), measurements (sq ft, m2), proper nouns
- If content contains property/project listings, use this structure:
  客户[Name]提供了[N]个[项目类型]：

  项目一：[Location]，[楼型] [用途]
  - [属性名]：[值]
  ...
  - 要价：[Currency] [Amount]

  （如有多个项目，继续列项目二、三...）

  下一步：
  确认客户角色（卖方/中介/买方）、产权文件、具体位置、收益证明、价格是否可谈、佣金关系，以及是否有买方资源。

- If content is a general chat conversation, summarize key business points in Chinese bullet points
- If content has no clear business intent, write: "（普通消息，无明确业务内容）"`;

  const isJsonMode = mode !== 'text_only';
  const isCnMode   = mode === 'chat_extract_cn';

  const promptText = isCnMode
    ? CHAT_EXTRACT_CN_PROMPT
    : mode === 'text_only'
      ? TEXT_ONLY_PROMPT
      : PARSE_PROMPT + (fileName ? `\n\nDocument file name: ${fileName}` : '');

  const geminiBody = JSON.stringify({
    contents: [{
      parts: [
        { text: promptText },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      ...(isJsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  try {
    // Try each model until one works (404 = model not available on this key)
    let geminiRes: Response | null = null;
    let triedModels: string[] = [];

    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      });
      triedModels.push(model);
      if (res.ok || res.status !== 404) {
        geminiRes = res;
        break;
      }
      console.warn(`[parse-quotation-file] ${model} → 404, trying next model...`);
    }

    if (!geminiRes) {
      return json({
        ok: false,
        visionUnavailable: true,
        error: '文件已保留为附件，但暂时无法自动识别明细。你仍可继续保存客户和跟进记录。',
        detail: `All models returned 404: ${triedModels.join(', ')}`,
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      // Any non-2xx from Gemini is treated as service unavailable — never block the CRM save flow.
      return json({
        ok: false,
        visionUnavailable: true,
        error: '文件已保留为附件，但暂时无法自动识别明细。你仍可继续保存客户和跟进记录。',
        detail: `Gemini ${geminiRes.status}: ${errText.slice(0, 300)}`,
      });
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // text_only mode: return raw extracted text directly
    if (mode === 'text_only') {
      return json({ ok: true, text: rawText.trim(), mode: 'text_only' });
    }

    let parsed: any;
    try {
      // Extract JSON object from response (model may wrap with extra text despite instructions)
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : rawText);
    } catch {
      return json({
        ok: false,
        error: '文件已收到，但 AI 返回格式异常，无法解析。请手动录入明细。',
        raw: rawText.slice(0, 300),
      });
    }

    // Normalize and validate items
    const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rawItems
      .filter(it => it && typeof it.item_name === 'string' && it.item_name.trim())
      .map(it => ({
        item_name:     String(it.item_name).trim(),
        description:   it.description ? String(it.description).trim() : null,
        qty:           it.qty != null ? (Number(it.qty) || null) : null,
        unit:          it.unit ? String(it.unit).trim() : null,
        selling_price: it.selling_price != null ? (Number(it.selling_price) || null) : null,
        line_total:    it.line_total    != null ? (Number(it.line_total)    || null) : null,
        currency:      String(it.currency || 'AED'),
        item_notes:    it.item_notes ? String(it.item_notes).trim() : null,
      }));

    if (items.length === 0) {
      return json({
        ok: false,
        error: '文件已收到，但未能识别出任何产品行。请检查文件是否清晰，或手动录入报价明细。',
        confidence: (parsed?.confidence as string) || 'low',
        warnings:   Array.isArray(parsed?.warnings) ? parsed.warnings : [],
      });
    }

    const grandTotal = parsed?.grandTotal != null ? (Number(parsed.grandTotal) || null) : null;

    return json({
      ok:           true,
      items,
      customerName: parsed?.customerName ? String(parsed.customerName).trim() : null,
      grandTotal,
      currency:     String(parsed?.currency || 'AED'),
      confidence:   String(parsed?.confidence || 'medium'),
      warnings:     Array.isArray(parsed?.warnings) ? parsed.warnings : [],
      itemCount:    items.length,
    });
  } catch (err: any) {
    return json({
      ok: false,
      error: `请求失败：${err?.message || '未知错误'}`,
    });
  }
}
