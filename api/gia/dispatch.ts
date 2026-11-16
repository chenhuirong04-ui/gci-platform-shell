// POST /api/gia/dispatch  { tool: string, args?: object }
//
// GIA P0 unified read-only tool dispatch. Not used by the UI yet.
//   1. requireUser — the caller's own Supabase session (401 without one).
//   2. tool lookup — unknown tool → 400.
//   3. canUseTool — caller's modules / Admin role; sensitive tools also
//      need `finance` (403 otherwise). See _registry.ts.
//   4. args validated against the tool's spec (400 on unknown/missing).
//   5. The existing endpoint handler is called in-process with ONLY the
//      caller's Authorization header, so its own requireModule and data
//      access run unchanged. Its status code is passed through.
import { requireUser } from '../_lib/auth';
import { findTool, canUseTool, validateArgs, buildUpstreamRequest } from './_registry';
import { GIA_HANDLERS } from './_handlers';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const auth = await requireUser(request);
  if (!auth.ok) return json(auth.body, auth.status);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const tool = findTool(body?.tool);
  if (!tool) return json({ ok: false, error: 'unknown_tool' }, 400);
  if (!canUseTool(auth.ctx, tool)) return json({ ok: false, error: 'tool_not_allowed', tool: tool.id }, 403);

  const args = validateArgs(tool, body?.args);
  if (!args.ok) return json({ ok: false, error: 'invalid_args', detail: args.error, tool: tool.id }, 400);

  const run = GIA_HANDLERS[tool.id];
  if (!run) return json({ ok: false, error: 'tool_not_wired', tool: tool.id }, 500);

  const authorization = request.headers.get('authorization') || '';
  let upstream: Response;
  try {
    upstream = await run(buildUpstreamRequest(tool, args.values, request.url, authorization));
  } catch (e) {
    console.error('[gia-dispatch] tool failed:', tool.id, e instanceof Error ? e.message : 'error');
    return json({ ok: false, error: 'tool_failed', tool: tool.id }, 502);
  }

  const data = await upstream.json().catch(() => null);
  return json(
    { ok: upstream.ok && data?.ok !== false, tool: tool.id, upstreamStatus: upstream.status, data },
    upstream.status,
    { 'X-GIA-Tool': tool.id },
  );
}
