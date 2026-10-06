import { ACTION_RISK, executeAction, isAssistantAction, validateActionEnvelope } from '../_actions';
import { authenticateAssistantAction, authorizeAssistantAction, json, readBody } from '../_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistantAction(request);
  if (!auth.ok) return auth.response;
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalid = validateActionEnvelope(parsed.body);
  if (invalid) return invalid;
  const action = parsed.body.action_type;
  if (!isAssistantAction(action)) return json({ ok: false, error: 'unsupported_action' }, 422);
  const forbidden = authorizeAssistantAction(auth, action);
  if (forbidden) return forbidden;
  const risk = ACTION_RISK[action];
  const confirmationToken = typeof parsed.body.confirmation_token === 'string' ? parsed.body.confirmation_token : undefined;
  const confirmedBy = typeof parsed.body.confirmed_by === 'string' ? parsed.body.confirmed_by.trim() : undefined;
  if (risk !== 'low' && (!confirmationToken || !confirmedBy)) {
    return json({ ok: false, error: 'confirmation_required', risk, preview_endpoint: '/api/assistant/actions/preview' }, 409);
  }
  return executeAction(
    request,
    auth.ctx,
    action,
    typeof parsed.body.target_id === 'string' ? parsed.body.target_id : null,
    parsed.body.payload as Record<string, unknown>,
    parsed.body.reason as string,
    confirmationToken,
    confirmedBy,
  );
}
