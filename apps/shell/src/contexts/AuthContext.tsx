import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  display_name: string;
  role_label: string;
  modules: string[];
  default_company_id: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  /** true while the initial session check is in flight */
  loading: boolean;
  /** Task 16.1 — set only if the initial session restore itself failed
   * (network error, thrown exception, etc.) — never set for the normal
   * "not logged in" case, which just resolves session:null. */
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Check whether the user has access to a given module key */
  can: (module: string) => boolean;
  /** Task 16.1 — retry the initial session restore after a failure. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    error: null,
  });
  const [retryTick, setRetryTick] = useState(0);

  async function loadProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, display_name, role_label, modules, default_company_id')
        .eq('id', userId)
        .eq('is_active', true)
        .single();
      if (error || !data) return null;
      return data as UserProfile;
    } catch {
      // A network-level failure here must never take down the whole
      // session-restore chain — treat it the same as "no profile row".
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    // Task 16.1 — root cause of the first-load black screen: this promise
    // chain previously had no .catch(). A cold-start network hiccup (or any
    // thrown exception anywhere in the chain, including inside
    // loadProfile) rejected it silently, `loading` never flipped to false,
    // and App.tsx/ProtectedRoute.tsx's `if (loading) return null` rendered
    // a permanently blank screen — exactly the "works after one manual
    // refresh" symptom, since a refresh just gives the retry a clean
    // network path. Every branch below now unconditionally resolves
    // `loading: false`, and a real failure surfaces as `error` (handled by
    // App.tsx's fallback UI) instead of hanging.
    supabase.auth.getSession()
      .then(async ({ data: { session }, error: sessionError }) => {
        if (cancelled) return;
        if (sessionError) throw sessionError;
        const profile = session?.user ? await loadProfile(session.user.id) : null;
        if (cancelled) return;
        setState({ session, user: session?.user ?? null, profile, loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ session: null, user: null, profile: null, loading: false, error: String(e?.message ?? e) });
      });

    // Keep in sync with Supabase auth state changes (sign in / sign out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      try {
        const profile = session?.user ? await loadProfile(session.user.id) : null;
        if (cancelled) return;
        setState({ session, user: session?.user ?? null, profile, loading: false, error: null });
      } catch (e: any) {
        if (cancelled) return;
        setState({ session: null, user: null, profile: null, loading: false, error: String(e?.message ?? e) });
      }
    });

    // Defensive fallback per Task 16.1 §三 — if something outside the
    // chain above still leaves loading stuck (a case we haven't
    // anticipated), never let the app hang indefinitely with no visible
    // state past a reasonable wait.
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setState((prev) => (prev.loading ? { ...prev, loading: false, error: prev.error ?? '会话加载超时' } : prev));
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [retryTick]);

  function retry() {
    setState({ session: null, user: null, profile: null, loading: true, error: null });
    setRetryTick((t) => t + 1);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function can(module: string): boolean {
    if (!state.profile) return false;
    return state.profile.modules.includes(module);
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, can, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
