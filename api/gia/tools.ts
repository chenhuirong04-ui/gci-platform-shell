// GET /api/gia/tools — the GIA tools the signed-in caller may use.
// Same policy as /api/gia/dispatch (see _registry.ts canUseTool).
import { requireUser } from '../_lib/auth';
import { listToolsFor } from './_registry';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

  const auth = await requireUser(request);
  if (!auth.ok) return json(auth.body, auth.status);

  return json({ ok: true, isAdmin: auth.ctx.isAdmin, tools: listToolsFor(auth.ctx) });
}
