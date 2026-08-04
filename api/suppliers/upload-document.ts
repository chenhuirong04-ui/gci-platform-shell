// api/suppliers/upload-document.ts
// Server-side supplier file storage authorization (product catalogues, licenses, certs).
// The service-role key stays server-side only — it issues short-lived signed
// upload/download URLs; actual file bytes travel browser → Supabase Storage
// directly and never pass through this function (avoids Vercel body-size limits).
export const config = { runtime: 'edge' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PRIVATE_DOC_TYPES = new Set([
  '营业执照', '公司注册文件', 'VAT文件', '税务文件', '合同', 'NDA', '银行资料', '认证证书',
]);

function resolveBucket(documentType: string): string {
  return PRIVATE_DOC_TYPES.has(documentType) ? 'suppliers-private' : 'suppliers-public';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SUPA_KEY) {
    return json({ ok: false, error: 'Server storage credentials are not configured (SUPABASE_SERVICE_ROLE_KEY missing)' }, 500);
  }

  const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const { action } = body;

  // ── Sign a stored object for viewing/downloading ──────────────────────────
  if (action === 'sign') {
    const { bucket, path, expiresIn } = body as { bucket?: string; path?: string; expiresIn?: number };
    if (!bucket || !path) return json({ ok: false, error: 'missing_fields' }, 400);
    const signRes = await fetch(`${SUPA_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresIn || 3600 }),
    });
    if (!signRes.ok) {
      const text = await signRes.text().catch(() => '');
      return json({ ok: false, error: `Sign failed (${signRes.status}): ${text}` }, 502);
    }
    const data = await signRes.json().catch(() => null);
    if (!data?.signedURL) return json({ ok: false, error: 'sign_no_url' }, 502);
    return json({ ok: true, url: `${SUPA_URL}/storage/v1${data.signedURL}` });
  }

  // ── Issue a short-lived signed upload slot (no file bytes here) ───────────
  if (action === 'create-upload-url') {
    const { supplierId, documentType, fileName } = body as {
      supplierId?: string; documentType?: string; fileName?: string;
    };
    if (!supplierId || !fileName) return json({ ok: false, error: 'missing_fields' }, 400);

    const bucket = resolveBucket(documentType || '其他');

    // Auto-provision the bucket (idempotent — ignores "already exists").
    const ensureRes = await fetch(`${SUPA_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    });
    if (!ensureRes.ok) {
      const text = await ensureRes.text().catch(() => '');
      const alreadyExists = ensureRes.status === 409 || /already exists|duplicate/i.test(text);
      if (!alreadyExists) return json({ ok: false, error: `Bucket setup failed (${ensureRes.status}): ${text}` }, 500);
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `suppliers/${supplierId}/${Date.now()}-${safeName}`;

    const signRes = await fetch(`${SUPA_URL}/storage/v1/object/upload/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!signRes.ok) {
      const text = await signRes.text().catch(() => '');
      return json({ ok: false, error: `无法取得上传授权（${signRes.status}）/ Failed to get upload authorization: ${text}` }, 502);
    }
    const data = await signRes.json().catch(() => null);
    if (!data?.url) return json({ ok: false, error: 'no_upload_url_returned' }, 502);

    const fullUrl = new URL(`${SUPA_URL}/storage/v1${data.url}`);
    const token = fullUrl.searchParams.get('token');
    if (!token) return json({ ok: false, error: 'no_token_returned' }, 502);

    return json({ ok: true, bucket, path, token });
  }

  // ── Best-effort cleanup of an orphaned object (metadata save failed) ──────
  if (action === 'delete-object') {
    const { bucket, path } = body as { bucket?: string; path?: string };
    if (!bucket || !path) return json({ ok: false, error: 'missing_fields' }, 400);
    const delRes = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!delRes.ok) {
      const text = await delRes.text().catch(() => '');
      return json({ ok: false, error: `delete failed (${delRes.status}): ${text}` }, 502);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: 'unknown_action' }, 400);
}
