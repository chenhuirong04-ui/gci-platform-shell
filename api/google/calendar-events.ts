// /api/google/calendar-events — read-only Calendar query.
// calendar.readonly only. Never creates, modifies, or deletes events.
export const config = { runtime: 'edge' };

import { getGoogleAccessToken, json } from './_googleAuth';

// GCI operates on Asia/Dubai (UTC+4). Boundaries are expressed with an
// explicit +04:00 offset so Google's API interprets them correctly without
// needing a UTC conversion here.
function dubaiDateStr(offsetDays = 0): string {
  const now = new Date();
  const dubai = new Date(now.getTime() + 4 * 3600 * 1000);
  dubai.setUTCDate(dubai.getUTCDate() + offsetDays);
  return dubai.toISOString().slice(0, 10);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || 'today';
  const dateParam = url.searchParams.get('date');

  let startDate: string;
  let endDate: string;
  if (dateParam) {
    startDate = dateParam;
    endDate = dateParam;
  } else if (range === 'tomorrow') {
    startDate = dubaiDateStr(1);
    endDate = startDate;
  } else if (range === 'week') {
    startDate = dubaiDateStr(0);
    endDate = dubaiDateStr(6); // next 7 days from today, inclusive
  } else {
    startDate = dubaiDateStr(0);
    endDate = startDate;
  }

  const timeMin = `${startDate}T00:00:00+04:00`;
  const timeMax = `${endDate}T23:59:59+04:00`;

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return json({ ok: false, error: auth.error }, 500);

  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '20',
    });
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) return json({ ok: false, error: data?.error?.message || 'Calendar query failed' }, 500);

    const results = (data.items || []).map((e: any) => ({
      title: e.summary || '(无标题)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      attendees: (e.attendees || []).map((a: any) => a.email).filter(Boolean),
      location: e.location || '',
      meetingLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || '',
    }));

    return json({ ok: true, range, startDate, endDate, results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
