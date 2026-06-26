import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}

/** Per V1 dev notes: AppShell wraps sidebar (fixed) + sticky header + scrollable content. Mount once at app root. */
export function AppShell({ sidebar, header, children }: AppShellProps) {
  return (
    <div className="flex" style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {sidebar}
      <div className="flex-1 flex flex-col min-w-0">
        {header}
        <main className="flex-1 min-w-0 overflow-y-auto relative" style={{ animation: 'fadeUp .4s ease both' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
