import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Password recovery — read the landing URL BEFORE createClient(): supabase-js
// consumes and strips the auth fragment (#access_token=…&type=recovery) while
// it initialises, so this is the only point where a recovery link can still be
// told apart from an ordinary sign-in.
const landingHash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
const landingSearch = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
const hashParams = new URLSearchParams(landingHash);
const searchParams = new URLSearchParams(landingSearch);

let recoveryPending = hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';

/** Error Supabase put on the landing URL for a used / expired link, if any. */
export const authLinkError: string | null =
  hashParams.get('error_code') || searchParams.get('error_code')
    ? (hashParams.get('error_description') || searchParams.get('error_description') || 'link_invalid')
    : null;

export const supabase = createClient(url, key);

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recoveryPending = true;
  if (event === 'SIGNED_OUT') recoveryPending = false;
});

/** True while the current session came from a password-recovery link and a
 * new password has not been set yet. */
export function isPasswordRecovery(): boolean {
  return recoveryPending;
}

export function clearPasswordRecovery(): void {
  recoveryPending = false;
}
