// Drop-in stand-in for `new GoogleGenAI({ apiKey })` in the browser.
// Same `models.generateContent({ model, contents, config })` → `{ text }`
// surface, but the call goes to /api/ai/gemini-generate, which holds the key.
// Used by the Quotation, CRM and Trade modules.

export interface GeminiProxyRequest {
  model?: string;
  contents: unknown;
  config?: {
    systemInstruction?: string;
    maxOutputTokens?: number;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
  };
}

// Schema type tags for responseSchema — same string values as @google/genai's
// Type enum, without pulling the SDK into the bundle.
export const SchemaType = {
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
} as const;

export const geminiProxy = {
  models: {
    async generateContent(req: GeminiProxyRequest): Promise<{ text: string }> {
      const res = await fetch('/api/ai/gemini-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        const reason = body?.error || (res.status === 413 ? 'File too large for AI analysis (max ~4MB)' : `HTTP ${res.status}`);
        throw new Error(`AI request failed: ${reason}`);
      }
      return { text: typeof body.text === 'string' ? body.text : '' };
    },
  },
};
