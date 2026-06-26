import type { ReactNode } from 'react';

interface WorkspaceCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function WorkspaceCard({ title, subtitle, children }: WorkspaceCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#101a30] p-6">
      <div className="font-mono-label text-[11px] tracking-[0.16em] text-[#cba85c] mb-1">
        {title}
      </div>
      {subtitle && <div className="text-[#8b95ad] text-xs mb-4">{subtitle}</div>}
      <div className={subtitle ? 'mt-0' : 'mt-4'}>{children}</div>
    </div>
  );
}
