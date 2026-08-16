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

export async function searchGmail(q: string): Promise<{ ok: true; query: string; results: GmailResult[] } | { ok: false; error: string }> {
  const res = await fetch(`${base()}/api/google/gmail-search?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function searchDrive(q: string): Promise<{ ok: true; query: string; results: DriveResult[] } | { ok: false; error: string }> {
  const res = await fetch(`${base()}/api/google/drive-search?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function getCalendarEvents(
  range: 'today' | 'tomorrow' | 'week',
  date?: string,
): Promise<{ ok: true; range: string; startDate: string; endDate: string; results: CalendarResult[] } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ range, ...(date ? { date } : {}) });
  const res = await fetch(`${base()}/api/google/calendar-events?${qs.toString()}`);
  return res.json();
}

export async function getImportantEmails(): Promise<{ ok: true; rule: string; results: GmailResult[] } | { ok: false; error: string }> {
  const res = await fetch(`${base()}/api/google/important-emails`);
  return res.json();
}
