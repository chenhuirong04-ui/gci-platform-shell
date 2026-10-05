import { authenticateAssistant, customerIdFromUrl, getCustomerDetail, isUuid, json } from '../_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const customerId = customerIdFromUrl(request);
  if (!isUuid(customerId)) return json({ ok: false, error: 'invalid_customer_id' }, 400);
  return getCustomerDetail(customerId, auth.ctx);
}
