import type { ReactNode } from 'react';
import { colors } from '../tokens';

interface HeaderProps {
  eyebrow: string;
  dateLine: string;
  searchPlaceholder: string;
  syncedLabel: string;
  trailing?: ReactNode;
  className?: string;
  /** Mobile nav drawer (2026-09): when provided, a hamburger button renders
   * before `eyebrow`, visible only below the md breakpoint (`md:hidden`) —
   * desktop layout is untouched when this prop is omitted. */
  onMenuClick?: () => void;
}

export function Header({ eyebrow, dateLine, searchPlaceholder, syncedLabel, trailing, className, onMenuClick }: HeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 md:px-6 lg:px-12 sticky top-0 z-10${className ? ` ${className}` : ''}`}
      style={{
        height: 'var(--header-h)',
        borderBottom: '1px solid rgba(255,255,255,0.045)',
        background: 'rgba(6,11,24,0.7)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Narrow widths (below lg): smaller padding, date hidden, eyebrow truncates,
          right-side controls never shrink — so the header fits the viewport instead
          of widening the page. lg and up is the original desktop layout. */}
      <div className="flex items-center min-w-0 gap-3 md:gap-[22px]">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="md:hidden flex items-center justify-center shrink-0"
            style={{
              width: 30,
              height: 30,
              marginLeft: -6,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: colors.textPrimary,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>☰</span>
          </button>
        )}
        <span className="font-mono-label truncate min-w-0" style={{ fontSize: 11, letterSpacing: '0.1em', color: colors.goldBase }}>
          {eyebrow}
        </span>
        <span className="hidden lg:block shrink-0" style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
        <span className="font-mono-label hidden lg:block whitespace-nowrap" style={{ fontSize: 11, color: '#505A70' }}>
          {dateLine}
        </span>
      </div>
      <div className="flex items-center shrink-0 gap-2 md:gap-[18px]">
        <div
          className="flex items-center md:w-[200px]"
          style={{ gap: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '7px 12px' }}
        >
          <span style={{ color: '#4A5268', fontSize: 13 }}>⌕</span>
          <span className="hidden md:inline truncate" style={{ fontSize: 12, color: '#4A5268' }}>{searchPlaceholder}</span>
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.statusSuccess, animation: 'pulse 3s ease infinite' }} />
          <span className="font-mono-label hidden sm:inline" style={{ fontSize: 10.5, color: '#5A6A50' }}>
            {syncedLabel}
          </span>
        </div>
        {trailing}
      </div>
    </div>
  );
}
