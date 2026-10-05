import {
  SAFE_PRIORITIES, SAFE_STATUSES, authenticateAssistant, customerIdFromUrl, executeWrite,
  isIsoDate, isUuid, json, readBody, validateKeys, validateText,
} from '../../_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const customerId = customerIdFromUrl(request);
  if (!isUuid(customerId)) return json({ ok: false, error: 'invalid_customer_id' }, 400);
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalidKeys = validateKeys(parsed.body, ['status', 'priority', 'notes', 'next_action', 'next_follow_up_at']);
  if (invalidKeys) return invalidKeys;
  const { status, priority, notes, next_action: nextAction, next_follow_up_at: nextFollowUpAt } = parsed.body;
  if (status !== undefined) {
    if (typeof status !== 'string' || !SAFE_STATUSES.has(status)) return json({ ok: false, error: 'unsafe_status' }, 422);
    return json({
      ok: false,
      error: 'confirmation_required',
      risk: 'medium',
      action_type: 'customer_status_update',
      preview_endpoint: '/api/assistant/actions/preview',
    }, 409);
  }
  if (priority !== undefined && (typeof priority !== 'string' || !SAFE_PRIORITIES.has(priority.toUpperCase()))) return json({ ok: false, error: 'invalid_priority' }, 422);
  if (notes !== undefined && !validateText(notes, 5000)) return json({ ok: false, error: 'invalid_notes' }, 422);
  if (nextAction !== undefined && !validateText(nextAction, 2000)) return json({ ok: false, error: 'invalid_next_action' }, 422);
  if (nextFollowUpAt !== undefined && nextFollowUpAt !== null && !isIsoDate(nextFollowUpAt)) return json({ ok: false, error: 'invalid_next_follow_up_at' }, 422);
  if (typeof priority === 'string') parsed.body.priority = priority.toUpperCase();
  return executeWrite(request, auth.ctx, 'customer_update', customerId, parsed.body);
}
