import {
  authenticateAssistant, createCustomer, json, readBody, validateKeys, validateText,
} from '../_lib';

export const config = { runtime: 'edge' };

const BUSINESS_TYPES = new Set(['25H/AI', 'Trade', 'Workforce/Technical Services', 'Ecommerce', 'Other']);

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalidKeys = validateKeys(parsed.body, ['customer_name', 'business_type', 'country', 'city']);
  if (invalidKeys) return invalidKeys;
  const { customer_name: name, business_type: businessType, country, city } = parsed.body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 300) {
    return json({ ok: false, error: 'invalid_customer_name' }, 422);
  }
  if (businessType !== undefined && (typeof businessType !== 'string' || !BUSINESS_TYPES.has(businessType))) {
    return json({ ok: false, error: 'invalid_business_type' }, 422);
  }
  if (country !== undefined && !validateText(country, 100, false)) return json({ ok: false, error: 'invalid_country' }, 422);
  if (city !== undefined && !validateText(city, 100, false)) return json({ ok: false, error: 'invalid_city' }, 422);
  return createCustomer(request, auth.ctx, {
    customer_name: name.trim(),
    ...(businessType !== undefined ? { business_type: businessType } : {}),
    ...(country !== undefined ? { country: String(country).trim() } : {}),
    ...(city !== undefined ? { city: String(city).trim() } : {}),
  });
}
