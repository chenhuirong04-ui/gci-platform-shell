import { supplierContext } from '../../_context';
import { authenticateAssistant, isUuid, json } from '../../_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).pathname.split('/').filter(Boolean).at(-1) || '';
  if (!isUuid(id)) return json({ ok: false, error: 'invalid_supplier_id' }, 400);
  return supplierContext(auth.ctx, id);
}
