import {
  authenticateAssistant, executeSupplierWrite, isIsoDate, json, readBody, validateKeys, validateText,
} from '../_lib.js';

export const config = { runtime: 'edge' };

const TYPES = new Set(['Factory', 'Trading', 'Integrated', 'Service', 'Agent', 'Unknown']);
const STATUSES = new Set(['active', 'inactive', 'blacklisted', 'under_review', 'archived']);
const RATINGS = new Set(['A', 'B', 'C', 'D']);
const FIELDS = ['supplier_name_display', 'short_code', 'legacy_short_code', 'name_cn', 'name_en', 'supplier_type', 'product_categories', 'country', 'city', 'is_preferred', 'status', 'current_rating', 'internal_owner', 'default_lead_time_days', 'payment_terms', 'strength_notes', 'website', 'established_year', 'next_action', 'next_follow_up_at', 'notes'];

export function validateSupplier(body: Record<string, unknown>, creating: boolean): Response | null {
  const invalid = validateKeys(body, FIELDS);
  if (invalid) return invalid;
  if ((creating || body.supplier_name_display !== undefined) && (typeof body.supplier_name_display !== 'string' || !body.supplier_name_display.trim())) return json({ ok: false, error: 'supplier_name_required' }, 422);
  for (const [field, max] of [['supplier_name_display', 500], ['short_code', 100], ['legacy_short_code', 100], ['name_cn', 500], ['name_en', 500], ['country', 200], ['city', 200], ['internal_owner', 200], ['payment_terms', 2000], ['strength_notes', 5000], ['website', 1000], ['next_action', 2000], ['notes', 5000]] as const) {
    if (body[field] !== undefined && !validateText(body[field], max)) return json({ ok: false, error: `invalid_${field}` }, 422);
  }
  if (body.supplier_type !== undefined && !TYPES.has(String(body.supplier_type))) return json({ ok: false, error: 'invalid_supplier_type' }, 422);
  if (body.status !== undefined && !STATUSES.has(String(body.status))) return json({ ok: false, error: 'invalid_status' }, 422);
  if (body.current_rating !== undefined && !RATINGS.has(String(body.current_rating))) return json({ ok: false, error: 'invalid_current_rating' }, 422);
  if (body.product_categories !== undefined && (!Array.isArray(body.product_categories) || body.product_categories.length > 100 || body.product_categories.some((v) => typeof v !== 'string' || v.length > 200))) return json({ ok: false, error: 'invalid_product_categories' }, 422);
  if (body.is_preferred !== undefined && typeof body.is_preferred !== 'boolean') return json({ ok: false, error: 'invalid_is_preferred' }, 422);
  if (body.default_lead_time_days !== undefined && (!Number.isInteger(body.default_lead_time_days) || Number(body.default_lead_time_days) < 0 || Number(body.default_lead_time_days) > 3650)) return json({ ok: false, error: 'invalid_default_lead_time_days' }, 422);
  if (body.established_year !== undefined && (!Number.isInteger(body.established_year) || Number(body.established_year) < 1000 || Number(body.established_year) > 2200)) return json({ ok: false, error: 'invalid_established_year' }, 422);
  if (body.next_follow_up_at !== undefined && body.next_follow_up_at !== null && !isIsoDate(body.next_follow_up_at)) return json({ ok: false, error: 'invalid_next_follow_up_at' }, 422);
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalid = validateSupplier(parsed.body, true);
  if (invalid) return invalid;
  const payload = Object.fromEntries(Object.entries(parsed.body).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  return executeSupplierWrite(request, auth.ctx, 'supplier_create', null, payload);
}
