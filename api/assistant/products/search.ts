import { searchProducts } from '../_context';
import { authenticateAssistant, json } from '../_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  return searchProducts(auth.ctx, new URL(request.url).searchParams.get('q') || '');
}
