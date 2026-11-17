// GIA P4 — shared read-only access for company-management data
// (公司文件 / 证照 / 内部事项 / 知识库). Used by api/company/{documents,tasks,knowledge}.ts.
//
// Access: every read is made AS THE CALLER (userRestHeaders / caller's own
// token), so the existing RLS decides what each user sees — company_documents
// and its storage bucket: any signed-in user; executive_tasks: any signed-in
// user; knowledge_*: by confidentiality level (Admins read all). Never the
// service-role key. GET only; nothing is written, deleted or sent anywhere.
// Original files are read in memory to answer the question and never stored.
// The account vault (company_account_logins) is never read. Credential-like
// values found in document text are masked before they leave this function.
import { userRestHeaders, type AuthContext } from '../_lib/auth';
import geminiGenerate from '../ai/gemini-generate';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function base(): string {
  const b = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!b) throw new Error('supabase_not_configured');
  return b;
}

export async function userRows<T>(ctx: AuthContext, table: string, query: string): Promise<T[]> {
  const res = await fetch(`${base()}/rest/v1/${table}?${query}`, {
    method: 'GET', headers: { ...userRestHeaders(ctx), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${table}_${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function userRpc<T>(ctx: AuthContext, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${base()}/rest/v1/rpc/${fn}`, {
    method: 'POST', // PostgREST RPC call — read-only function (knowledge_search is STABLE)
    headers: { ...userRestHeaders(ctx), 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}_${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Download one object from a private bucket as the caller (storage RLS applies). */
export async function downloadAsUser(ctx: AuthContext, bucket: string, path: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const url = `${base()}/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { method: 'GET', headers: userRestHeaders(ctx) });
  if (!res.ok) throw new Error(`storage_${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_FILE_BYTES) throw new Error('file_too_large');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error('file_too_large');
  return { bytes: buf, mime: (res.headers.get('content-type') || '').split(';')[0] || 'application/octet-stream' };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

const READ_PROMPT =
  'Transcribe this company document completely and faithfully as plain text, in its original language(s). ' +
  'Keep every clause, party name, number, date, amount, licence activity and table row; lay out tables as "label: value" lines. ' +
  'Do not summarise, translate, add commentary or invent anything that is not visible. ' +
  'If a part is unreadable write [unreadable]. Never output passwords, PINs, API keys or other login credentials — write [hidden] instead.';

/**
 * Full text of one file via the existing Gemini proxy (api/ai/gemini-generate,
 * same server key, model allowlist and module check, called in-process with
 * the caller's own Authorization — the same reuse pattern as api/gia/_model.ts).
 */
export async function readFileText(request: Request, file: { bytes: Uint8Array; mime: string }, maxChars = 20000): Promise<string> {
  const req = new Request(new URL('/api/ai/gemini-generate', request.url).toString(), {
    method: 'POST',
    headers: { authorization: request.headers.get('authorization') || '', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ inline_data: { mime_type: file.mime, data: toBase64(file.bytes) } }, { text: READ_PROMPT }] },
      config: { maxOutputTokens: 8192 },
    }),
  });
  const res = await geminiGenerate(req);
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || typeof data.text !== 'string') throw new Error(`read_failed_${res.status}`);
  const text = maskCredentials(data.text.trim());
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…[已截断，全文共 ${text.length} 字]` : text;
}

/** Mask values that look like login credentials (password / PIN / API key / token / secret). */
export function maskCredentials(text: string): string {
  return String(text ?? '').replace(
    /((?:password|passcode|passwd|pwd|pin(?:\s*code)?|api[\s_-]?key|secret|access[\s_-]?token|token|密码|口令|密钥|验证码)\s*[:：=]\s*)([^\s,;，；]+)/gi,
    '$1[已隐藏]',
  );
}

export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_.,()（）/]/g, '');
export const clip = (s: unknown, n: number) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
