import {
  authenticateAssistant, customerIdFromUrl, executeWrite, isUuid, json, readBody,
  validateKeys, validateText,
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
  const invalidKeys = validateKeys(parsed.body, ['contact_id', 'contact_name', 'phone', 'whatsapp', 'email', 'is_primary']);
  if (invalidKeys) return invalidKeys;
  const { contact_id: contactId, contact_name: contactName, phone, whatsapp, email, is_primary: isPrimary } = parsed.body;
  if (contactId !== undefined && (typeof contactId !== 'string' || !isUuid(contactId))) return json({ ok: false, error: 'invalid_contact_id' }, 422);
  if (contactName !== undefined && !validateText(contactName, 300)) return json({ ok: false, error: 'invalid_contact_name' }, 422);
  if (phone !== undefined && !validateText(phone, 100)) return json({ ok: false, error: 'invalid_phone' }, 422);
  if (whatsapp !== undefined && !validateText(whatsapp, 100)) return json({ ok: false, error: 'invalid_whatsapp' }, 422);
  if (email !== undefined && !validateText(email, 320)) return json({ ok: false, error: 'invalid_email' }, 422);
  if (isPrimary !== undefined && typeof isPrimary !== 'boolean') return json({ ok: false, error: 'invalid_is_primary' }, 422);
  const hasContactField = ['contact_name', 'phone', 'whatsapp', 'email', 'is_primary'].some((key) => key in parsed.body);
  if (!hasContactField) return json({ ok: false, error: 'contact_fields_required' }, 422);
  return executeWrite(request, auth.ctx, 'contact_upsert', customerId, parsed.body);
}
