import {
  authenticateAssistant, executeSupplierWrite, isUuid, json, readBody, supplierIdFromUrl, validateKeys, validateText,
} from '../../_lib.js';

export const config = { runtime: 'edge' };
const FIELDS = ['contact_id', 'full_name', 'job_title', 'department', 'contact_role', 'phone', 'mobile', 'whatsapp', 'wechat', 'email', 'preferred_language', 'is_primary', 'is_decision_maker', 'is_commercial_contact', 'is_technical_contact', 'is_finance_contact', 'is_logistics_contact', 'status', 'notes'];

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const supplierId = supplierIdFromUrl(request);
  if (!isUuid(supplierId)) return json({ ok: false, error: 'invalid_supplier_id' }, 400);
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalid = validateKeys(parsed.body, FIELDS);
  if (invalid) return invalid;
  if (parsed.body.contact_id !== undefined && (typeof parsed.body.contact_id !== 'string' || !isUuid(parsed.body.contact_id))) return json({ ok: false, error: 'invalid_contact_id' }, 422);
  if (parsed.body.contact_id === undefined && (typeof parsed.body.full_name !== 'string' || !parsed.body.full_name.trim())) return json({ ok: false, error: 'full_name_required' }, 422);
  if (parsed.body.full_name !== undefined && (typeof parsed.body.full_name !== 'string' || !parsed.body.full_name.trim())) return json({ ok: false, error: 'full_name_required' }, 422);
  for (const [field, max] of [['full_name', 300], ['job_title', 200], ['department', 200], ['contact_role', 200], ['phone', 100], ['mobile', 100], ['whatsapp', 100], ['wechat', 100], ['email', 320], ['preferred_language', 100], ['status', 100], ['notes', 5000]] as const) {
    if (parsed.body[field] !== undefined && !validateText(parsed.body[field], max)) return json({ ok: false, error: `invalid_${field}` }, 422);
  }
  for (const field of ['is_primary', 'is_decision_maker', 'is_commercial_contact', 'is_technical_contact', 'is_finance_contact', 'is_logistics_contact']) {
    if (parsed.body[field] !== undefined && typeof parsed.body[field] !== 'boolean') return json({ ok: false, error: `invalid_${field}` }, 422);
  }
  const payload = Object.fromEntries(Object.entries(parsed.body).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  return executeSupplierWrite(request, auth.ctx, 'supplier_contact_upsert', supplierId, payload);
}
