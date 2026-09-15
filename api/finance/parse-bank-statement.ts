// /api/finance/parse-bank-statement
// POST { mimeType: string, data: string (base64) }
// Uses Gemini Vision to split a bank statement (PDF/image, one or more
// pages/screenshots) into individual line items. Different shape from
// parse-voucher.ts (array output, not a single fields object) — CSV/Excel
// statements are parsed client-side instead of through this endpoint (see
// bookkeepingService.ts), since structured exports don't need vision AI.
// Returns { ok: true, lines: [...] } or { ok: false, error: string }
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

const STATEMENT_PROMPT = `You are a bank statement parser. The document is a bank account
statement (one or more transaction lines). Extract EVERY transaction line
visible in the document.
Return ONLY valid JSON - no markdown, no explanation. Use this schema:
{
  "lines": [
    {
      "date": "YYYY-MM-DD or null",
      "direction": "in | out (in = money received/credit/deposit, out = money paid/debit/withdrawal)",
      "amount": "number (plain number, no currency symbol, always positive)",
      "description": "string (the raw bank description/narration text exactly as shown)"
    }
  ]
}
Rules: One entry per transaction line, in the same order as the statement. Convert dates to YYYY-MM-DD. amount must be a positive plain number. Never merge two lines into one, never invent a line that isn't shown. If you cannot read a field, use null for that field but still include the line.`;

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
        { text: STATEMENT_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
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

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return json({ ok: false, error: 'AI returned non-JSON response', rawPreview: rawText.slice(0, 500) });
      }
      const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
      return json({ ok: true, lines, model });
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  return json({ ok: false, error: `All Gemini models failed. Last error: ${lastError}` }, 502);
}
