// /api/google/drive-create-folder — Task 17 GIA File Inbox write step.
// Idempotent: looks up an existing folder by name+parent first (drive.readonly,
// unchanged) and only calls files.create (drive.file — new, additive scope)
// if nothing was found. Never deletes, never moves, never touches files it
// didn't create itself.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body: { name?: string; parentId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const name = body.name?.trim();
  const parentId = body.parentId?.trim();
  if (!name || !parentId) return json({ ok: false, error: 'Missing name or parentId' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  try {
    // 1. Check if it already exists (drive.readonly).
    const findQuery = `name = '${esc(name)}' and '${esc(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const findRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(findQuery)}&fields=files(id,name,webViewLink)`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const findData = await findRes.json();
    if (!findRes.ok) return json({ ok: false, error: findData?.error?.message || 'Drive lookup failed' }, 500);
    if (findData.files && findData.files.length > 0) {
      return json({ ok: true, created: false, folder: findData.files[0] });
    }

    // 2. Not found — create it (drive.file).
    const createRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
      },
    );
    const createData = await createRes.json();
    if (!createRes.ok) return json({ ok: false, error: createData?.error?.message || 'Drive create failed' }, 500);

    return json({ ok: true, created: true, folder: createData });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
