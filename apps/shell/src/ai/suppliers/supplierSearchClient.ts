// Thin client wrapper for /api/suppliers/search
import type { SupplierSearchResponse, SupplierSearchError } from './supplierSearchTypes';

const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';

export async function searchSuppliers(
  query: string,
  filters?: {
    country?: string;
    category?: string;
    certification?: string;
    preferredOnly?: boolean;
  },
): Promise<SupplierSearchResponse | SupplierSearchError> {
  const res = await fetch(`${API_BASE}/api/suppliers/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters }),
  });
  return res.json();
}
