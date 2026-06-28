import type { ReactNode } from 'react';
import { colors, statusMap, type StatusKey } from '../tokens';

export interface SectionHeaderProps {
  /** Drives the dot/icon color and the count pill background via the
   * centralized statusMap — never pass a raw hex from a page. */
  status: StatusKey;
  icon: ReactNode;
  title: string;
  count?: number;
  /** Shown instead of the count pill when count is 0 or undefined. */
  emptyLabel?: string;
  /** Extra badge(s) rendered after the title (e.g. a Badge for "规则引擎"). */
  trailing?: ReactNode;
  className?: string;
}

/** Status-colored section header — dot + icon + title + count pill.
 * Replaces the BlockHeader pattern that used to live inline in business
 * pages with raw hex dot colors. */
export function SectionHeader({ status, icon, title, count, emptyLabel, trailing, className }: SectionHeaderProps) {
  const s = statusMap[status];
  return (
    <div className={['flex items-center gap-2', className].filter(Boolean).join(' ')}>
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
      <div style={{ color: s.color }}>{icon}</div>
      <span className="text-xs font-black uppercase tracking-widest" style={{ color: colors.bgBase }}>{title}</span>
      {trailing}
      {count !== undefined && count > 0 ? (
        <span
          className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ml-auto"
          style={{ backgroundColor: s.color }}
        >
          {count}
        </span>
      ) : emptyLabel ? (
        <span className="text-[9px] font-bold text-slate-400 ml-auto">{emptyLabel}</span>
      ) : null}
    </div>
  );
}
