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

// -- Per-document-type prompts -----------------------------------------------

const PROMPTS: Record<string, string> = {
  TRADE_LICENSE: `You are a UAE/GCC trade license parser. Extract all visible fields from this document.
Return ONLY valid JSON - no markdown, no explanation. Use this schema:
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
  "activities": ["list of business activities as strings - empty array if none found"],
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

  SUPPLIER_TRADE_LICENSE: `You are an expert document parser for business registration documents worldwide (China, UAE, Hong Kong, UK, EU, US, and other jurisdictions).
Extract all visible fields from this business license, business registration certificate, or trade license.
Return ONLY valid JSON - no markdown, no explanation. Use this schema:
{
  "legal_name": "official registered company name in original language or null",
  "name_en": "English company name or null",
  "name_cn": "Chinese company name or null",
  "document_number": "license/registration number or null",
  "registration_number": "separate company registration number if different from license number or null",
  "country": "country of registration (English) or null",
  "city": "city of registration or null",
  "registered_address": "full registered address or null",
  "legal_representative": "legal representative / director / owner name or null",
  "business_activities": ["list of business activities or scope - empty array if not found"],
  "issuing_authority": "issuing government body or null",
  "issue_date": "YYYY-MM-DD or null",
  "expire_date": "YYYY-MM-DD or null",
  "vat_number": "VAT/tax registration number if visible or null",
  "capital": "registered capital if shown or null",
  "confidence": "high | medium | low"
}
Rules: Convert all dates to YYYY-MM-DD format. For Chinese 营业执照: legal_name = 名称, document_number = 统一社会信用代码/注册号, legal_representative = 法定代表人, expire_date = 营业期限. Never guess missing fields - use null.`,

  SUPPLIER_CERTIFICATION: `You are an expert certification document parser. Extract all visible fields from this certification, test report, compliance certificate, or quality standard document.
Return ONLY valid JSON - no markdown, no explanation. Use this schema:
{
  "certification_type": "one of: CE | FDA | ISO9001 | ISO14001 | ISO22000 | HACCP | Halal | SGS | RoHS | REACH | SASO | ESMA | EAC | GSO | BSCI | SEDEX | GMP | Other",
  "standard_number": "specific standard reference e.g. EN 71, ISO 9001:2015 or null",
  "certification_number": "certificate number/ID or null",
  "supplier_name": "certified company/supplier name or null",
  "issuing_body": "certification body e.g. SGS, Bureau Veritas, TUV, INTERTEK or null",
  "issue_date": "YYYY-MM-DD or null",
  "expire_date": "YYYY-MM-DD or null",
  "market_scope": "geographic scope e.g. EU, UAE, China, US or null",
  "covered_products": ["list of product names or categories covered - empty array if not found"],
  "covered_models": ["list of specific model numbers covered - empty array if not found"],
  "scope_description": "brief description of what is covered or null",
  "confidence": "high | medium | low"
}
Rules: Convert all dates to YYYY-MM-DD format. For CE mark: market_scope = EU. For SASO: market_scope = Saudi Arabia. Pick the MOST SPECIFIC certification_type that matches; use Other only if none match. Never guess missing fields - use null.`,
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
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  };

  let lastError = '';
  for (const model of GEMINI_MODELS) {
    let geminiStatus = 0;
    let rawText = '';
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      geminiStatus = res.status;
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = `Gemini ${model} HTTP ${res.status}: ${errBody.slice(0, 300)}`;
        continue;
      }
      const geminiData: any = await res.json();
      rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // 1. Strip markdown fences
      let cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      // 2. Extract first {...} block as fallback
      if (!cleaned.startsWith('{')) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) cleaned = match[0];
      }

      let fields: Record<string, unknown>;
      try {
        fields = JSON.parse(cleaned);
      } catch {
        return json({
          ok: false,
          error: 'AI returned non-JSON response',
          geminiStatus,
          mimeType,
          documentType,
          rawPreview: rawText.slice(0, 500),
        });
      }
      return json({ ok: true, fields, model });
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  return json({ ok: false, error: `All Gemini models failed. Last error: ${lastError}` }, 502);
}
