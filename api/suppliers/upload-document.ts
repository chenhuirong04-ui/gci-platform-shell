// api/suppliers/upload-document.ts
// Server-side supplier file storage (product catalogues, licenses, certs).
// Uses the service-role key so browser clients never need direct Storage RLS access.
// Auto-provisions the target bucket on first use, so no manual Dashboard step is required.
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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

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
    return json({ ok: true, url: `${SUPA_URL}${data.signedURL}` });
  }

  // ── Upload a new file ──────────────────────────────────────────────────────
  if (action === 'upload') {
    const { supplierId, documentType, fileName, mimeType, dataBase64 } = body as {
      supplierId?: string; documentType?: string; fileName?: string; mimeType?: string; dataBase64?: string;
    };
    if (!supplierId || !fileName || !dataBase64) return json({ ok: false, error: 'missing_fields' }, 400);

    let bytes: Uint8Array;
    try { bytes = base64ToBytes(dataBase64); } catch { return json({ ok: false, error: 'invalid_file_data' }, 400); }
    if (bytes.length > MAX_BYTES) {
      return json({ ok: false, error: `文件过大（${(bytes.length / 1024 / 1024).toFixed(1)}MB），请上传 15MB 以内的文件 / File too large, please upload under 15MB` }, 413);
    }

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

    const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': mimeType || 'application/octet-stream', 'x-upsert': 'true' },
      body: bytes,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      return json({ ok: false, error: `文件上传失败（${uploadRes.status}）：${text} / Upload failed (${uploadRes.status})` }, 502);
    }

    // Best-effort signed URL for immediate use; failure here doesn't fail the upload.
    let url = '';
    const signRes = await fetch(`${SUPA_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (signRes.ok) {
      const d = await signRes.json().catch(() => null);
      if (d?.signedURL) url = `${SUPA_URL}${d.signedURL}`;
    }

    return json({ ok: true, path, bucket, url });
  }

  return json({ ok: false, error: 'unknown_action' }, 400);
}
