// TEMPORARY DIAGNOSTIC — identify which Google AI Studio key GEMINI_API_KEY
// points to in Production, without ever exposing the key itself. Returns only
// a truncated SHA-256 fingerprint and the last 4 characters — never the full
// key, never a prefix, never any other env var. Delete this file (and its
// deployment) immediately after use; it is not meant to stay live.
export const config = { runtime: 'edge' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'GEMINI_API_KEY not configured' }, 500);

  const fullHash = await sha256Hex(key);
  return json({
    fingerprint: fullHash.slice(0, 12),
    last4: key.slice(-4),
  });
}
