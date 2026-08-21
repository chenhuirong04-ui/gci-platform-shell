// GCI Executive Desk — Task 5.2 client-side wrappers for the Google read
// routes. No Google credentials ever live here — every call just hits our
// own /api/google/* server routes.
// Gmail wrappers (searchGmail/getImportantEmails/getTodayEmails/
// getGmailThread + GmailResult/GmailThreadMessage) removed — final product
// decision: GCI/GIA no longer reads email at all. Drive/Calendar untouched.
function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
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
