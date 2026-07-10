// /api/bs/parse-document
// POST { mimeType: string, data: string (base64), documentType: string }
// Uses Gemini Vision to extract structured fields from business documents.
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

// ── Per-document-type prompts ──────────────────────────────────────────────

const PROMPTS: Record<string, string> = {
  TRADE_LICENSE: `You are a UAE/GCC trade license parser. Extract all visible fields from this document.
Return ONLY valid JSON — no markdown, no explanation. Use this schema:
{
  "license_number": "string or null",
  "licensee_name": "string or null",
  "trade_name": "string or null",
  "legal_status": "string or null (e.g. LLC, FZ-LLC, Sole Proprietor)",
  "issuing_authority": "string or null (e.g. DED, DMCC, IFZA, DIFC)",
  "manager_name": "string or null",
  "issue_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "premises_number": "string or null",
  "building_name": "string or null",
  "area_name": "string or null",
  "activities": ["list of business activities as strings — empty array if none found"],
  "confidence": "high | medium | low"
}
Rules: Convert all dates to YYYY-MM-DD. If a field is not visible, use null. Never guess.`,

  LICENSE_RENEWAL: `Same as trade license parser. Extract all visible fields.
Return ONLY valid JSON:
{
  "license_number": "string or null",
  "licensee_name": "string or null",
  "trade_name": "string or null",
  "legal_status": "string or null",
  "issuing_authority": "string or null",
  "manager_name": "string or null",
  "issue_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}`,

  VAT_CERTIFICATE: `You are a UAE VAT certificate parser.
Return ONLY valid JSON:
{
  "license_number": "TRN number or null",
  "licensee_name": "registered business name or null",
  "trade_name": "trade name or null",
  "issuing_authority": "FTA",
  "issue_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}`,

  CORPORATE_TAX_CERTIFICATE: `You are a UAE Corporate Tax certificate parser.
Return ONLY valid JSON:
{
  "license_number": "Tax Registration Number or null",
  "licensee_name": "registered business name or null",
  "issuing_authority": "FTA",
  "issue_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}`,

  PASSPORT: `You are a passport parser. Extract Machine Readable Zone (MRZ) and visual fields.
Return ONLY valid JSON:
{
  "full_name": "string or null (surname + given names)",
  "nationality": "string or null (country name)",
  "passport_number": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "passport_expiry_date": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}
Rules: Convert dates to YYYY-MM-DD. Full name = SURNAME + space + GIVEN NAMES.`,

  EMIRATES_ID: `You are a UAE Emirates ID card parser.
Return ONLY valid JSON:
{
  "full_name": "string or null",
  "emirates_id_number": "string or null (format: 784-YYYY-XXXXXXX-X)",
  "nationality": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "emirates_id_expiry_date": "YYYY-MM-DD or null",
  "uid_number": "string or null (if shown separately)",
  "confidence": "high | medium | low"
}`,

  WORK_VISA: `You are a UAE residence visa/work permit parser.
Return ONLY valid JSON:
{
  "full_name": "string or null",
  "uid_number": "UID number or null",
  "visa_number": "visa/permit number or null",
  "visa_type": "string or null (e.g. Employment, Investor, etc.)",
  "nationality": "string or null",
  "visa_expiry_date": "YYYY-MM-DD or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}`,

  INVESTOR_VISA: `Same as work visa parser. Return ONLY valid JSON:
{
  "full_name": "string or null",
  "uid_number": "UID number or null",
  "visa_number": "visa number or null",
  "visa_type": "Investor",
  "nationality": "string or null",
  "visa_expiry_date": "YYYY-MM-DD or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}`,

  FAMILY_VISA: `Same as residence visa parser but for family/dependent visa.
Return ONLY valid JSON:
{
  "full_name": "string or null",
  "uid_number": "UID or null",
  "visa_number": "string or null",
  "visa_type": "Family / Dependent",
  "nationality": "string or null",
  "visa_expiry_date": "YYYY-MM-DD or null",
  "confidence": "high | medium | low"
}`,
};

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'GEMINI_API_KEY not configured' }, 500);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const { mimeType, data, documentType } = body;
  if (!mimeType || !data || !documentType) {
    return json({ ok: false, error: 'Missing required fields: mimeType, data, documentType' }, 400);
  }

  const isImage = (mimeType as string).startsWith('image/');
  const isPdf   = mimeType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ ok: false, error: `Unsupported file type: ${mimeType}. Only PDF and images are supported.` }, 400);
  }

  const prompt = PROMPTS[documentType as string];
  if (!prompt) {
    return json({ ok: false, error: `No parser defined for document type: ${documentType}` }, 400);
  }

  // Strip data URL prefix if present
  const base64 = typeof data === 'string' && data.includes(',') ? data.split(',')[1] : data;

  const geminiBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
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
        lastError = `Gemini ${model} returned ${res.status}`;
        continue;
      }
      const geminiData: any = await res.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Strip markdown fences if present
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      let fields: Record<string, unknown>;
      try {
        fields = JSON.parse(cleaned);
      } catch {
        return json({ ok: false, error: 'AI returned non-JSON response', raw: rawText });
      }
      return json({ ok: true, fields, model });
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  return json({ ok: false, error: `All Gemini models failed. Last error: ${lastError}` }, 502);
}
