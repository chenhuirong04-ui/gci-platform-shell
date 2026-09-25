// /api/ai/gemini-generate
// POST { model?, contents, config? } — the same request shape the Quotation,
// CRM and Trade modules used to pass to @google/genai's
// ai.models.generateContent() in the browser.
// Returns { ok: true, text } (the model's concatenated reply text).
//
// Server-side proxy so GEMINI_API_KEY never reaches the browser bundle.
// Caller must hold one of the modules that use it, and the model must be one
// of the allowlisted ones, so this is not an open Gemini relay.
export const config = { runtime: 'edge' };

import { requireModule } from '../_lib/auth';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-3-flash-preview']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// The SDK accepts `contents` as a string, a single Content, or Content[];
// the REST API only takes Content[].
function toRestContents(contents: unknown): unknown[] | null {
  if (typeof contents === 'string') return [{ role: 'user', parts: [{ text: contents }] }];
  if (Array.isArray(contents)) return contents.length > 0 ? contents : null;
  if (contents && typeof contents === 'object' && Array.isArray((contents as any).parts)) {
    return [{ role: 'user', ...(contents as object) }];
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const gciAuth = await requireModule(request, ['quotation', 'crm', 'trade']);
  if (!gciAuth.ok) return gciAuth.response;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'Gemini API not configured on server' }, 500);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body (file may be too large — max ~4MB)' }, 400);
  }

  const model = body?.model || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(model)) return json({ ok: false, error: `Model not allowed: ${model}` }, 400);

  const contents = toRestContents(body?.contents);
  if (!contents) return json({ ok: false, error: 'Missing contents' }, 400);

  const cfg = body?.config || {};
  const generationConfig: Record<string, unknown> = {};
  if (cfg.responseMimeType) generationConfig.responseMimeType = cfg.responseMimeType;
  if (cfg.responseSchema) generationConfig.responseSchema = cfg.responseSchema;
  if (typeof cfg.maxOutputTokens === 'number') generationConfig.maxOutputTokens = cfg.maxOutputTokens;
  if (typeof cfg.temperature === 'number') generationConfig.temperature = cfg.temperature;

  const restBody: Record<string, unknown> = { contents, generationConfig };
  if (typeof cfg.systemInstruction === 'string' && cfg.systemInstruction) {
    restBody.systemInstruction = { parts: [{ text: cfg.systemInstruction }] };
  }

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(restBody),
    });
  } catch (e: any) {
    return json({ ok: false, error: `Gemini unreachable: ${e?.message || e}` }, 502);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return json({ ok: false, error: `Gemini ${res.status}: ${errText.slice(0, 300)}` }, 502);
  }

  const data: any = await res.json().catch(() => null);
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  // Skip "thought" parts (2.5/3 models) — the SDK's response.text does the same.
  const text = parts.map((p) => (typeof p?.text === 'string' && !p?.thought ? p.text : '')).join('');
  return json({ ok: true, text });
}
