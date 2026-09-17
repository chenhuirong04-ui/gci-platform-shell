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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Temporary diagnostic step (2026-09-17): GET this endpoint to see which
// models this GEMINI_API_KEY can actually call generateContent on, straight
// from Google's own ListModels — server-side only, key never leaves this
// function. Used once to confirm real model names before finalizing the
// POST path's model-selection logic; safe to keep (read-only, no cost beyond
// the ListModels call itself).
async function listAvailableModels(apiKey: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, error: `ListModels HTTP ${res.status}: ${errBody.slice(0, 500)}` };
    }
    const data: any = await res.json();
    const models: string[] = (data?.models || [])
      .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
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

// 2026-09-17: hardcoded model names kept going stale (gemini-2.0-flash /
// gemini-1.5-flash 404'd; the next hardcoded guess also partly failed for
// this specific API key). Priority order is still a fixed preference, but
// each request now checks it against a live ListModels call before ever
// trying generateContent — see listAvailableModels() above and its use below.
const PRIORITY_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'GEMINI_API_KEY not configured' }, 500);

  if (request.method === 'GET') {
    const result = await listAvailableModels(apiKey);
    return json(result, result.ok ? 200 : 502);
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

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

  // Check the priority list against what this API key can actually reach
  // right now, instead of trusting a hardcoded name — see PRIORITY_MODELS'
  // own comment for why.
  const availability = await listAvailableModels(apiKey);
  if (!availability.ok) {
    console.error(`[company-documents/parse-document] ListModels failed: ${availability.error}`);
    return json({ ok: false, error: 'Could not verify available AI models. Please try again shortly.' }, 502);
  }
  const candidateModels = PRIORITY_MODELS.filter((m) => availability.models.includes(m));
  if (candidateModels.length === 0) {
    console.error(
      `[company-documents/parse-document] None of the priority models are available for this API key. `
      + `Priority: ${PRIORITY_MODELS.join(', ')}. Available (generateContent): ${availability.models.join(', ')}`,
    );
    return json({ ok: false, error: 'No supported Gemini generateContent model is available for this API key.' }, 502);
  }

  const geminiBody = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  };

  const triedModels: string[] = [];
  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        // Full detail (model, HTTP status, Google's own message) goes to the
        // server log only — the client only ever sees a short generic error.
        console.error(`[company-documents/parse-document] model=${model} HTTP ${res.status} message=${errBody.slice(0, 800)}`);
        triedModels.push(model);
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
        console.error(`[company-documents/parse-document] model=${model} returned non-JSON: ${rawText.slice(0, 500)}`);
        return json({ ok: false, error: 'AI returned an unreadable response. Please try again or fill in manually.' }, 502);
      }
      return json({ ok: true, fields, model });
    } catch (e: any) {
      console.error(`[company-documents/parse-document] model=${model} threw: ${e?.message || e}`);
      triedModels.push(model);
    }
  }

  console.error(`[company-documents/parse-document] All candidate models failed. Tried: ${triedModels.join(', ')}`);
  return json({ ok: false, error: 'AI recognition is temporarily unavailable. Please try again or fill in manually.' }, 502);
}
