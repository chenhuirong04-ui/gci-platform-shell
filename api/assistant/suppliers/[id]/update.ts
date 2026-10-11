import { authenticateAssistant, executeSupplierWrite, isUuid, json, readBody, supplierIdFromUrl } from '../../_lib.js';
import { validateSupplier } from '../create.js';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  const supplierId = supplierIdFromUrl(request);
  if (!isUuid(supplierId)) return json({ ok: false, error: 'invalid_supplier_id' }, 400);
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const invalid = validateSupplier(parsed.body, false);
  if (invalid) return invalid;
  const payload = Object.fromEntries(Object.entries(parsed.body).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  return executeSupplierWrite(request, auth.ctx, 'supplier_update', supplierId, payload);
}
