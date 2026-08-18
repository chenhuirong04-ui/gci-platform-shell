// /api/google/drive-list-folder — read-only Drive folder browsing.
// Task 17 (GIA File Inbox audit): same drive.readonly scope as
// drive-search.ts, no new permission. Never downloads file content, never
// moves/renames/deletes/creates anything — GET only, lists what's already
// there. Two modes:
//   ?name=X       — find folders by name (to resolve a root folder's id)
//   ?parentId=X   — list immediate children (files + folders) of that folder
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const name = url.searchParams.get('name')?.trim();
  const parentId = url.searchParams.get('parentId')?.trim();
  if (!name && !parentId) return json({ ok: false, error: 'Provide name or parentId' }, 400);

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const driveQuery = parentId
    ? `'${esc(parentId)}' in parents and trashed = false`
    : `name = '${esc(name!)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=folder,name&pageSize=200`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const data = await res.json();
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'Drive list failed' }, 500);

    return json({ ok: true, results: data.files || [] });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
