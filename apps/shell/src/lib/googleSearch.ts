// GCI Executive Desk — Task 5.2 client-side wrappers for the Google read
// routes. No Google credentials ever live here — every call just hits our
// own /api/google/* server routes.
function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export interface GmailResult {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  link: string;
}

export interface DriveResult {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

export interface CalendarResult {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location: string;
  meetingLink: string;
}

// Never throws — a failed fetch or a non-JSON response (e.g. a platform
// timeout page) always resolves to { ok: false, error }, so callers never
// need a .catch() and the UI never gets stuck on an unhandled rejection.
async function safeFetchJson<T>(url: string): Promise<T | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: res.ok ? 'Server returned a non-JSON response.' : `Request failed (${res.status}): ${text.slice(0, 200)}` };
    }
    return data;
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export async function searchGmail(q: string): Promise<{ ok: true; query: string; results: GmailResult[] } | { ok: false; error: string }> {
  return safeFetchJson(`${base()}/api/google/gmail-search?q=${encodeURIComponent(q)}`);
}

export async function searchDrive(q: string): Promise<{ ok: true; query: string; results: DriveResult[] } | { ok: false; error: string }> {
  return safeFetchJson(`${base()}/api/google/drive-search?q=${encodeURIComponent(q)}`);
}

export async function getCalendarEvents(
  range: 'today' | 'tomorrow' | 'week',
  date?: string,
): Promise<{ ok: true; range: string; startDate: string; endDate: string; results: CalendarResult[] } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ range, ...(date ? { date } : {}) });
  return safeFetchJson(`${base()}/api/google/calendar-events?${qs.toString()}`);
}

export async function getImportantEmails(): Promise<{ ok: true; rule: string; results: GmailResult[] } | { ok: false; error: string }> {
  return safeFetchJson(`${base()}/api/google/important-emails`);
}

// Task 11.1 — Email Chat Assistant: full thread content (subject/from/to/date
// + plain-text body, HTML safely converted server-side, attachments listed
// by name/type only — never fetched/decoded). gmail.readonly only.
export interface GmailThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  attachments: { filename: string; mimeType: string; size: number }[];
}

export async function getGmailThread(
  threadId: string,
): Promise<{ ok: true; threadId: string; messages: GmailThreadMessage[] } | { ok: false; error: string }> {
  return safeFetchJson(`${base()}/api/google/gmail-thread?threadId=${encodeURIComponent(threadId)}`);
}
