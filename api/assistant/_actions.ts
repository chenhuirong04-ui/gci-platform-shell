import {
  type AssistantContext, actionRequestHash, callRpc, idempotencyKey, json,
} from './_lib';

export const ACTION_RISK = {
  task_create: 'low',
  update_task_due_date: 'low',
  update_task_status: 'medium',
  complete_commitment: 'medium',
  close_decision: 'medium',
  mark_decision_duplicate: 'medium',
  update_asset_review_status: 'medium',
  update_decision_execution_status: 'medium',
  quotation_draft_create: 'low',
  invoice_draft_create: 'low',
  project_note_update: 'low',
  supplier_note_update: 'low',
  quotation_draft_update: 'medium',
  invoice_draft_update: 'medium',
  customer_status_update: 'medium',
  customer_owner_update: 'medium',
  project_update: 'medium',
  supplier_product_price_update: 'medium',
  invoice_issue: 'high',
  project_complete: 'high',
  customer_close: 'high',
} as const;

export type AssistantAction = keyof typeof ACTION_RISK;

const ACTION_CENTER_ACTIONS = new Set<AssistantAction>([
  'update_task_due_date',
  'update_task_status',
  'complete_commitment',
  'close_decision',
  'mark_decision_duplicate',
  'update_asset_review_status',
  'update_decision_execution_status',
]);

export function isAssistantAction(value: unknown): value is AssistantAction {
  return typeof value === 'string' && value in ACTION_RISK;
}

export function validateActionEnvelope(body: Record<string, unknown>): Response | null {
  const allowed = new Set(['action_type', 'target_id', 'payload', 'reason', 'confirmation_token', 'confirmed_by']);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) return json({ ok: false, error: 'unsupported_fields', fields: unknown }, 422);
  if (!isAssistantAction(body.action_type)) return json({ ok: false, error: 'unsupported_action' }, 422);
  if (body.target_id !== undefined && body.target_id !== null && typeof body.target_id !== 'string') {
    return json({ ok: false, error: 'invalid_target_id' }, 422);
  }
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    return json({ ok: false, error: 'invalid_payload' }, 422);
  }
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) {
    return json({ ok: false, error: 'reason_required_max_1000' }, 422);
  }
  return null;
}

function rpcError(detail: string, status = 502): Response {
  const known: Array<[string, number, string]> = [
    ['assistant_confirmation_required', 409, 'confirmation_required'],
    ['assistant_confirmation_invalid', 409, 'confirmation_invalid'],
    ['assistant_confirmation_expired', 409, 'confirmation_expired'],
    ['assistant_confirmation_mismatch', 409, 'confirmation_mismatch'],
    ['assistant_idempotency_conflict', 409, 'idempotency_conflict'],
    ['assistant_target_not_found', 404, 'target_not_found'],
    ['assistant_invalid_transition', 409, 'invalid_transition'],
    ['assistant_invalid_payload', 422, 'invalid_payload'],
    ['assistant_forbidden_action', 403, 'forbidden_action'],
  ];
  const match = known.find(([needle]) => detail.includes(needle));
  return match ? json({ ok: false, error: match[2] }, match[1]) : json({ ok: false, error: 'action_failed' }, status);
}

export async function previewAction(
  ctx: AssistantContext,
  action: AssistantAction,
  targetId: string | null,
  payload: Record<string, unknown>,
  reason: string,
): Promise<Response> {
  const hash = await actionRequestHash(action, targetId, payload);
  const rpc = ACTION_CENTER_ACTIONS.has(action)
    ? 'assistant_preview_action_center_action'
    : 'assistant_preview_business_action';
  const result = await callRpc<any>(ctx, rpc, {
    p_action_type: action,
    p_target_id: targetId,
    p_payload: payload,
    p_request_hash: hash,
    p_reason: reason.trim(),
    p_actor: ctx.actor,
  });
  if (!result.ok) return rpcError(result.detail, result.status);
  return json(result.data);
}

export async function executeAction(
  request: Request,
  ctx: AssistantContext,
  action: AssistantAction,
  targetId: string | null,
  payload: Record<string, unknown>,
  reason: string,
  confirmationToken?: string,
  confirmedBy?: string,
): Promise<Response> {
  const key = idempotencyKey(request);
  if (!key) return json({ ok: false, error: 'valid_idempotency_key_required' }, 400);
  const hash = await actionRequestHash(action, targetId, payload);
  const rpc = ACTION_CENTER_ACTIONS.has(action)
    ? 'assistant_execute_action_center_action'
    : 'assistant_execute_business_action';
  const result = await callRpc<any>(ctx, rpc, {
    p_action_type: action,
    p_target_id: targetId,
    p_payload: payload,
    p_idempotency_key: key,
    p_request_hash: hash,
    p_reason: reason.trim(),
    p_confirmation_token: confirmationToken || null,
    p_confirmed_by: confirmedBy || null,
    p_actor: ctx.actor,
  });
  if (!result.ok) return rpcError(result.detail, result.status);
  return json(result.data);
}
