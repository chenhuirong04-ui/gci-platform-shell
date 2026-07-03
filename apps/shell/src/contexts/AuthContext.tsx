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
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Check whether the user has access to a given module key */
  can: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  });

  async function loadProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, display_name, role_label, modules, default_company_id')
      .eq('id', userId)
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return data as UserProfile;
  }

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const profile = session?.user ? await loadProfile(session.user.id) : null;
      setState({ session, user: session?.user ?? null, profile, loading: false });
    });

    // Keep in sync with Supabase auth state changes (sign in / sign out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const profile = session?.user ? await loadProfile(session.user.id) : null;
      setState({ session, user: session?.user ?? null, profile, loading: false });
    });

    return () => subscription.unsubscribe();
  }, []);

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
    <AuthContext.Provider value={{ ...state, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
