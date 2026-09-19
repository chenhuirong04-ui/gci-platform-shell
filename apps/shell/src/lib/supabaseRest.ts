import { supabase } from './supabase';

// Direct PostgREST / Storage calls made AS the signed-in user, so database
// and Storage RLS apply to them. Replaces the per-module hardcoded anon-key
// headers that used to be duplicated across the Suppliers and Business
// Solutions clients.
//
// `apikey` is the public project key Supabase requires on every request (it
// grants no data access by itself); the identity is the user's access token
// in Authorization. supabase-js refreshes an expired token inside
// getSession(). With no session (signed out) the anon key is sent as Bearer —
// once RLS is tightened that request is simply denied, which surfaces the
// problem instead of masking it.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export async function sbAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
}
