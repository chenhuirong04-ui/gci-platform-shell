// Server-to-server, read-only CRM follow-up feed for the GCI CRM Daily Reminder.
// The caller must present GCI_CRM_REMINDER_SECRET. Database access stays inside
// GCI APP Production and uses its existing service-role key; no secret or PII is
// exposed to the browser.
export const config = { runtime: 'edge' };

const EXPECTED_SUPABASE_ORIGIN = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const CLOSED_STATUSES = new Set(['已关闭', '已完成', 'closed', 'done']);
const RESPONSE_FIELDS = 'id,customer_name,status,priority,owner,next_follow_up_at,next_action';

type ReminderCustomer = {
  id: string;
  customer_name: string;
  status: string | null;
  priority: string | null;
  owner: string | null;
  next_follow_up_at: string;
  next_action: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
    },
  });
}

function bearer(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

async function secretMatches(received: string, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(receivedHash);
  const b = new Uint8Array(expectedHash);
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) different |= a[i] ^ b[i];
  return different === 0;
}

function dubaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function isClosed(status: string | null): boolean {
  return CLOSED_STATUSES.has(String(status || '').trim().toLowerCase());
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const expectedSecret = process.env.GCI_CRM_REMINDER_SECRET || '';
  if (!(await secretMatches(bearer(request), expectedSecret))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (supabaseUrl !== EXPECTED_SUPABASE_ORIGIN || !serviceKey) {
    return json({ ok: false, error: 'server_config_missing' }, 500);
  }

  const date = dubaiDate();
  const params = new URLSearchParams({
    select: RESPONSE_FIELDS,
    is_active: 'eq.true',
    next_follow_up_at: `lte.${date}`,
    order: 'next_follow_up_at.asc,customer_name.asc',
    limit: '1000',
  });

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/crm_customers?${params}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  } catch {
    return json({ ok: false, error: 'crm_unreachable' }, 502);
  }
  if (!response.ok) return json({ ok: false, error: `crm_query_${response.status}` }, 502);

  const rows = await response.json().catch(() => null) as ReminderCustomer[] | null;
  if (!Array.isArray(rows)) return json({ ok: false, error: 'crm_response_invalid' }, 502);

  const eligible = rows.filter((row) => row.next_follow_up_at && !isClosed(row.status));
  return json({
    ok: true,
    date,
    today: eligible.filter((row) => row.next_follow_up_at === date),
    overdue: eligible.filter((row) => row.next_follow_up_at < date),
  });
}
