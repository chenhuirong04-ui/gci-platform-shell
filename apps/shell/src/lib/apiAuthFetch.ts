import { supabase } from './supabase';

// Attaches the current Supabase session token as `Authorization: Bearer …`
// to every same-origin `/api/*` request, so the server-side auth helper
// (api/_lib/auth.ts) can identify the caller. Installed once, before the app
// renders, so the ~100 existing fetch('/api/…') call sites need no changes.
// Requests that already carry an Authorization header (e.g. account-vault)
// are left untouched; non-/api and cross-origin requests are never modified.
let installed = false;

export function installApiAuthFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl, window.location.origin);
      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
            return nativeFetch(input, { ...init, headers });
          }
        }
      }
    } catch {
      // Never let token lookup break a request — fall through to a plain fetch.
    }
    return nativeFetch(input, init);
  };
}
