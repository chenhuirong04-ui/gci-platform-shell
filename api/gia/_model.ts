// GIA P2 — model access. Reuses the existing server-side Gemini proxy
// (api/ai/gemini-generate.ts) in-process with the caller's own Authorization:
// same GEMINI_API_KEY (server env, never sent to the browser), same model
// allowlist, same module check. No new AI client, no new key.
import geminiGenerate from '../ai/gemini-generate';

export const GIA_MODEL = 'gemini-2.5-flash';

export interface ModelCall {
  systemInstruction: string;
  prompt: string;
  /** JSON response schema (Gemini responseSchema); omit for plain text. */
  responseSchema?: unknown;
  maxOutputTokens?: number;
}

/** Returns the model's reply text; throws on any failure (caller falls back). */
export async function callGiaModel(baseUrl: string, authorization: string, call: ModelCall): Promise<string> {
  const config: Record<string, unknown> = { systemInstruction: call.systemInstruction };
  if (call.responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = call.responseSchema;
  }
  if (call.maxOutputTokens) config.maxOutputTokens = call.maxOutputTokens;
  const req = new Request(new URL('/api/ai/gemini-generate', baseUrl).toString(), {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ model: GIA_MODEL, contents: call.prompt, config }),
  });
  const res = await geminiGenerate(req);
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || typeof data.text !== 'string' || !data.text.trim()) {
    throw new Error(`model_failed_${res.status}`);
  }
  return data.text;
}
