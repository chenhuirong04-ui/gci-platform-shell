import { ACTION_RISK, isAssistantAction, previewAction, validateActionEnvelope } from '../_actions';
import { authenticateAssistant, json, readBody } from '../_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalid = validateActionEnvelope(parsed.body);
  if (invalid) return invalid;
  const action = parsed.body.action_type;
  if (!isAssistantAction(action)) return json({ ok: false, error: 'unsupported_action' }, 422);
  if (ACTION_RISK[action] === 'low') {
    return json({ ok: false, error: 'preview_not_required', risk: 'low', execute_directly: true }, 422);
  }
  return previewAction(
    auth.ctx,
    action,
    typeof parsed.body.target_id === 'string' ? parsed.body.target_id : null,
    parsed.body.payload as Record<string, unknown>,
    parsed.body.reason as string,
  );
}
