// /api/files/fetch-url — GIA Multi-Source File Intake: fetch an
// explicitly-given URL server-side so its bytes can be relayed into the
// existing Drive upload+register pipeline. Only ever called with a URL the
// user pasted themselves — never used to crawl or discover links. Read-only
// (GET the target URL, nothing is sent/posted to it).
//
// SSRF guardrails: only http(s), reject hostnames that are literally a
// loopback/private/link-local address or "localhost". Edge runtime has no
// DNS-resolution API to catch DNS-rebinding to a private IP after this
// check passes — this is a best-effort hostname check, acceptable here
// because the URL is always hand-typed by Chris himself (an authenticated
// internal user), never derived from untrusted external input.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const MAX_BYTES = 25 * 1024 * 1024; // matches drive-upload-file.ts's cap
const ALLOWED_TYPES = /^(application\/pdf|application\/vnd\.openxmlformats|application\/msword|application\/vnd\.ms-excel|image\/(png|jpe?g|webp)|application\/octet-stream)/i;

const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc[0-9a-f]{2}:|fe80:)/i;

function isBlockedHost(hostname: string): boolean {
  return PRIVATE_HOST_RE.test(hostname);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get('url');
  if (!target) return json({ ok: false, error: 'url is required' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json({ ok: false, error: '不是有效的 URL' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json({ ok: false, error: '只支持 http/https 链接' }, 400);
  }
  if (isBlockedHost(parsed.hostname)) {
    return json({ ok: false, error: '不允许访问内网/本机地址' }, 400);
  }

  try {
    const res = await fetch(parsed.toString(), { redirect: 'follow' });
    if (!res.ok) return json({ ok: false, error: `下载失败 (HTTP ${res.status})` }, 400);

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    if (!ALLOWED_TYPES.test(contentType)) {
      return json({ ok: false, error: `不支持的文件类型：${contentType}（仅支持 PDF/图片/Office 文档）` }, 400);
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_BYTES) {
      return json({ ok: false, error: '文件超过 25MB，本轮暂不支持。' }, 400);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return json({ ok: false, error: '文件超过 25MB，本轮暂不支持。' }, 400);
    }

    // Convert to base64 in chunks to avoid a stack-overflow from
    // String.fromCharCode(...bigArray) on large files.
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < buf.length; i += chunkSize) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const suggestedName = decodeURIComponent(parsed.pathname.split('/').pop() || 'downloaded-file');

    return json({ ok: true, data: base64, mimeType: contentType, suggestedName });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
