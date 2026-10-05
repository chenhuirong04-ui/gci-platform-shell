import {
  SAFE_STATUSES, authenticateAssistant, customerIdFromUrl, dubaiDate, executeWrite,
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
  const invalidKeys = validateKeys(parsed.body, ['notes', 'next_action', 'next_follow_up_at', 'follow_up_date', 'method', 'status', 'owner']);
  if (invalidKeys) return invalidKeys;
  const { notes, next_action: nextAction, next_follow_up_at: nextFollowUpAt, follow_up_date: followUpDate, method, status, owner } = parsed.body;
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 5000) return json({ ok: false, error: 'notes_required_max_5000' }, 422);
  if (nextAction !== undefined && !validateText(nextAction, 2000)) return json({ ok: false, error: 'invalid_next_action' }, 422);
  if (nextFollowUpAt !== undefined && nextFollowUpAt !== null && !isIsoDate(nextFollowUpAt)) return json({ ok: false, error: 'invalid_next_follow_up_at' }, 422);
  if (followUpDate !== undefined && !isIsoDate(followUpDate)) return json({ ok: false, error: 'invalid_follow_up_date' }, 422);
  if (method !== undefined && !validateText(method, 100)) return json({ ok: false, error: 'invalid_method' }, 422);
  if (owner !== undefined && !validateText(owner, 200)) return json({ ok: false, error: 'invalid_owner' }, 422);
  if (status !== undefined && (typeof status !== 'string' || !SAFE_STATUSES.has(status))) return json({ ok: false, error: 'unsafe_status' }, 422);
  parsed.body.notes = notes.trim();
  parsed.body.follow_up_date = typeof followUpDate === 'string' ? followUpDate : dubaiDate();
  return executeWrite(request, auth.ctx, 'followup_create', customerId, parsed.body);
}
