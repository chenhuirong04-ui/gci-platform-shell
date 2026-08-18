// /api/google/drive-upload-file — Task 17 GIA File Inbox write step.
// Accepts a multipart/form-data POST (file, targetFolderId, fileName) from
// the GIA chat-first upload confirm card and uploads it to Drive via
// drive.file scope (this app-created file becomes fully accessible to the
// app afterward — that's exactly what drive.file is for). Metadata only is
// ever persisted by GCI Platform itself (File Registry, added separately);
// the file bytes live in Drive, never copied into Supabase.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'Invalid multipart form body' }, 400);
  }

  const file = form.get('file');
  const targetFolderId = String(form.get('targetFolderId') || '').trim();
  const fileName = String(form.get('fileName') || '').trim();
  if (!(file instanceof Blob) || !targetFolderId || !fileName) {
    return json({ ok: false, error: 'Missing file, targetFolderId, or fileName' }, 400);
  }
  if (file.size > 25 * 1024 * 1024) {
    return json({ ok: false, error: '文件超过 25MB，本轮暂不支持（可分批处理或先压缩）。' }, 400);
  }

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    const boundary = 'gci_gia_upload_' + Math.random().toString(36).slice(2);
    const metadata = { name: fileName, parents: [targetFolderId] };
    const mimeType = file.type || 'application/octet-stream';
    const encoder = new TextEncoder();

    const head = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const tail = encoder.encode(`\r\n--${boundary}--`);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const body = new Blob([head, fileBytes, tail]);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    const data = await res.json();
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'Drive upload failed' }, 500);

    return json({ ok: true, file: data });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
