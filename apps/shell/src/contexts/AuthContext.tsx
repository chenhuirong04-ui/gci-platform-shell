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
  /** Task 18.3 — true only while a resolved session's profile row is still
   * being fetched. Decoupled from `loading` on purpose: a slow/failing
   * profile query must never hold up session restore itself (see below). */
  profileLoading: boolean;
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
    profileLoading: false,
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

    // Task 18.3 — root cause of the recurring "会话加载超时" on Production:
    // the previous chain awaited loadProfile() BEFORE ever resolving
    // `loading: false`, so a slow (not even failing — just slow) user_profiles
    // query held up session restore itself. Any occasional latency there
    // (RLS check, cold connection, etc.) could push the combined
    // getSession()+loadProfile() time past the 10s defensive timeout, which
    // then classified a perfectly valid, already-resolved session as a
    // failure. Fix: resolve `loading: false` the moment the session itself
    // is known — profile fetches in the background afterward via its own
    // `profileLoading` flag, which ProtectedRoute treats as a brief loading
    // state rather than a permission denial.
    //
    // (Task 16.1 history preserved: every branch below still unconditionally
    // resolves `loading: false`, so a thrown exception anywhere can't leave
    // it stuck and silently blank the screen again.)
    function applySession(session: Session | null) {
      if (cancelled) return;
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
        error: null,
        profile: session?.user ? prev.profile : null,
        profileLoading: !!session?.user,
      }));
      if (session?.user) {
        const userId = session.user.id;
        loadProfile(userId).then((profile) => {
          if (cancelled) return;
          setState((prev) => (prev.user?.id === userId ? { ...prev, profile, profileLoading: false } : prev));
        });
      }
    }

    supabase.auth.getSession()
      .then(({ data: { session }, error: sessionError }) => {
        if (cancelled) return;
        if (sessionError) throw sessionError;
        applySession(session);
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ session: null, user: null, profile: null, loading: false, profileLoading: false, error: String(e?.message ?? e) });
      });

    // Keep in sync with Supabase auth state changes (sign in / sign out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    // Defensive fallback per Task 16.1 §三 — if something outside the
    // chain above still leaves loading stuck (a case we haven't
    // anticipated), never let the app hang indefinitely with no visible
    // state past a reasonable wait. Now that profile load no longer blocks
    // this, getSession() itself should resolve well under 10s in any
    // ordinary case — this timeout only fires for a genuinely hung request.
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
    setState({ session: null, user: null, profile: null, loading: true, profileLoading: false, error: null });
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
