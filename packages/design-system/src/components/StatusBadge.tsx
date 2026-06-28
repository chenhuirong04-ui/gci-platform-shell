import type { ReactNode } from 'react';
import { statusMap, type StatusKey } from '../tokens';

interface StatusBadgeProps {
  status: StatusKey;
  label: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const s = statusMap[status];
  return (
    <span
      className="font-mono-label"
      style={{
        color: s.color,
        background: s.bg,
        borderRadius: 5,
        letterSpacing: '0.08em',
        fontSize: size === 'sm' ? 9.5 : 11,
        padding: size === 'sm' ? '2px 6px' : '3px 9px',
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}

export interface BadgeProps {
  /** Either a centralized StatusKey (preferred — goes through the same
   * statusMap as StatusBadge), or an explicit color+bg pair for non-status
   * chips that don't represent a business state (e.g. "规则引擎", "GPT-4o",
   * a rank number, a bizId tag, a day-count pill). */
  status?: StatusKey;
  color?: string;
  bg?: string;
  label: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/** Generic colored pill — the non-status sibling of StatusBadge. Centralizes
 * the many one-off "small rounded chip with a tinted background" patterns
 * that were previously hardcoded per page (e.g. ActionCenter's
 * RuleEngineBadge, GPT-4o tag, 低优先 tag, bizId tag). */
export function Badge({ status, color, bg, label, icon, size = 'md', className }: BadgeProps) {
  const resolved = status ? statusMap[status] : { color: color ?? '#64748B', bg: bg ?? '#F1F5F9' };
  return (
    <span
      className={['inline-flex items-center gap-1 font-black', className].filter(Boolean).join(' ')}
      style={{
        color: resolved.color,
        background: resolved.bg,
        borderRadius: size === 'sm' ? 5 : 6,
        fontSize: size === 'sm' ? 9 : 10,
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
      }}
    >
      {icon}
      {label}
    </span>
  );
}
