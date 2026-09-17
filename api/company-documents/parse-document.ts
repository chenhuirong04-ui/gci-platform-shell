// /api/company-documents/parse-document
// POST { mimeType: string, data: string (base64) }
// Company Documents Intelligence V2 Phase 1: one Gemini Vision call that both
// classifies the document (against the 8 supported types below) and extracts
// a fixed field set. Same Gemini call pattern as api/finance/parse-voucher.ts
// / api/bs/parse-document.ts (model fallback list, base64 inline_data, strict
// JSON-only response) — a new file rather than reusing those because this
// feature's schema (document_type + suggested_category together, numeric
// confidence) and its 8-type list are its own, not a variant of either of
// those files' schemas. GEMINI_API_KEY is the same env var those already use.
// Returns { ok: true, fields: {...}, model } or { ok: false, error: string }
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

// Phase 1's 8 supported types (Company Documents Intelligence V2 spec). Any
// other document must still be returned, never blocked — as "Other" / "Unknown".
const PROMPT = `You are a document classifier and field extractor for a Dubai/UAE trading company's company-documents archive. The image or PDF is ONE company document. First decide which type it is, then extract fields. Never fabricate a value that isn't actually visible in the document — if you cannot read it, use null.

Recognized document types (use EXACTLY one of these strings for "document_type", or "Other" if it's a real document type just not in this list, or "Unknown" if you truly cannot tell what it is):
- Trade License
- CIC Card
- VAT Certificate
- Corporate Tax Certificate
- MOA/AOA
- POA
- Ejari / Lease
- Establishment Card

Return ONLY valid JSON — no markdown, no explanation. Use exactly this schema:
{
  "document_type": "one of the 8 types above, or Other, or Unknown",
  "suggested_category": "the same value as document_type — this is the category name to suggest matching against the company's existing category list",
  "company_name": "string or null — the company/licensee/entity name on the document",
  "document_number": "string or null — the license/certificate/registration number shown (e.g. license no., TRN, CIC number). Never invent one — if none is legible, null",
  "issue_date": "YYYY-MM-DD or null — never guess, only if an issue date is actually printed",
  "expiry_date": "YYYY-MM-DD or null — never guess, only if an expiry date is actually printed",
  "issuing_authority": "string or null — the government body/free zone authority that issued it (e.g. DED, DMCC, Federal Tax Authority)",
  "summary": "string or null — one short plain-language sentence describing what this document is",
  "confidence": 0.0
}
Rules: confidence is a plain number from 0.0 to 1.0 reflecting how sure you are about document_type and the extracted fields overall — low if the image is blurry, cropped, or a field was genuinely unreadable. All dates must be YYYY-MM-DD. Never guess a document number or a date that isn't legible — null is always correct over a guess.`;

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

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
        { text: PROMPT },
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
