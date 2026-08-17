import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { StartupLoading, StartupError } from './StartupScreen';

interface Props {
  /** One or more module keys — access is granted if the user has ANY of them.
   * e.g. module="trade" or module={['trade','finance','warehouse']} */
  module: string | string[];
  children: ReactNode;
}

export function ProtectedRoute({ module, children }: Props) {
  const { loading, session, can, error, retry } = useAuth();

  // Task 16.1 — same black-screen fix as App.tsx: a visible state instead
  // of `return null` while the session restore is in flight or failed.
  if (loading) return <StartupLoading />;
  if (error && !session) return <StartupError message={error} onRetry={retry} />;
  if (!session) return <Navigate to="/login" replace />;

  const keys = Array.isArray(module) ? module : [module];
  const allowed = keys.some(k => can(k));
  if (!allowed) return <Navigate to="/access-denied" replace />;

  return <>{children}</>;
}
