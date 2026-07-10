import type { ServiceCustomer, ServiceQuote } from '../types';

const BASE = '/api/bs';

export async function syncCustomerToNotion(
  customer: ServiceCustomer,
): Promise<{ notion_page_id?: string; skipped?: boolean } | null> {
  try {
    const res = await fetch(`${BASE}/notion-create-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customer),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function syncQuoteToNotion(
  quote: ServiceQuote,
): Promise<{ notion_page_id?: string; skipped?: boolean } | null> {
  try {
    const res = await fetch(`${BASE}/notion-upsert-quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quote),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
