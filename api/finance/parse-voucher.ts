// /api/finance/parse-voucher
// POST { mimeType: string, data: string (base64) }
// Uses Gemini Vision to extract structured fields from a single finance
// voucher (invoice / receipt / payment screenshot / collection screenshot).
// Same Gemini call pattern as api/bs/parse-document.ts — separate file
// because this is Finance's own document type, not one of that file's
// business-solutions/supplier document schemas.
// Returns { ok: true, fields: {...} } or { ok: false, error: string }
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

const VOUCHER_PROMPT = `You are a finance document parser for a UAE/China trading company. The
image is ONE of: a supplier invoice, a receipt, a payment confirmation
screenshot (bank transfer/cheque photo), or a customer payment/collection
screenshot. Extract whatever is visible — never fabricate a value that
isn't actually shown.
Return ONLY valid JSON - no markdown, no explanation. Use this schema:
{
  "date": "YYYY-MM-DD or null",
  "amount": "number or null (the total/net amount, as a plain number, no currency symbol)",
  "currency": "string or null (e.g. AED, USD, CNY)",
  "counterparty": "string or null (the other party's name — supplier, customer, or payee/payer shown)",
  "invoice_no": "string or null (invoice/receipt/reference number if shown)",
  "vat_amount": "number or null (VAT/tax amount if separately shown, else null)",
  "description": "string or null (what this is for — item/service/purpose, in a short phrase)",
  "confidence": "high | medium | low"
}
Rules: Convert dates to YYYY-MM-DD. amount and vat_amount must be plain numbers (e.g. 1250.50), never strings with currency symbols. If a field is not visible, use null. Never guess.`;

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

import { requireModule } from '../_lib/auth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const gciAuth = await requireModule(request, ['finance', 'trade']);
  if (!gciAuth.ok) return gciAuth.response;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'GEMINI_API_KEY not configured' }, 500);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const { mimeType, data } = body;
  if (!mimeType || !data) {
    return json({ ok: false, error: 'Missing required fields: mimeType, data' }, 400);
  }

  const isImage = (mimeType as string).startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ ok: false, error: `Unsupported file type: ${mimeType}. Only PDF and images are supported.` }, 400);
  }

  const base64 = typeof data === 'string' && data.includes(',') ? data.split(',')[1] : data;

  const geminiBody = {
    contents: [{
      parts: [
        { text: VOUCHER_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  };

  let lastError = '';
  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = `Gemini ${model} HTTP ${res.status}: ${errBody.slice(0, 300)}`;
        continue;
      }
      const geminiData: any = await res.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      if (!cleaned.startsWith('{')) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) cleaned = match[0];
      }

      let fields: Record<string, unknown>;
      try {
        fields = JSON.parse(cleaned);
      } catch {
        return json({ ok: false, error: 'AI returned non-JSON response', rawPreview: rawText.slice(0, 500) });
      }
      return json({ ok: true, fields, model });
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  return json({ ok: false, error: `All Gemini models failed. Last error: ${lastError}` }, 502);
}
