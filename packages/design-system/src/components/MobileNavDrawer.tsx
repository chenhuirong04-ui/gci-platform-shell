import { useEffect, type ReactNode } from 'react';
import { colors } from '../tokens';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The exact same <Sidebar forceVisible /> element the caller already
   * builds for desktop — same nav data, same permission filter, same
   * active-item logic. This component only supplies the drawer chrome
   * (backdrop, slide-in panel, close button), it never renders nav items
   * itself. */
  children: ReactNode;
}

/**
 * Mobile nav drawer (2026-09). Below the sidebar's `md` breakpoint the
 * desktop <Sidebar> is `display:none`, so phones had no way to reach any
 * module besides whatever the current page happened to link to. This is a
 * slide-in copy of the same sidebar, opened via Header's hamburger button.
 *
 * Closing: backdrop click, the X button, or clicking any actual nav row —
 * every clickable row in Sidebar carries the `.nv` class, so a single
 * delegated click listener on the panel (matching `.closest('.nv')`) covers
 * "selecting a menu item closes the drawer" without needing to touch
 * Sidebar's own onClick wiring or nav data at all. Clicks on section
 * headers/whitespace inside the panel do NOT close it.
 */
export function MobileNavDrawer({ open, onClose, children }: MobileNavDrawerProps) {
  // Lock background scroll while the drawer is open; always restore on
  // close/unmount so this can never leave the page stuck non-scrollable.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', animation: 'fadeUp .18s ease both' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.nv')) onClose();
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: 'min(84vw, 300px)',
          background: 'var(--bg-shell)',
          boxShadow: '8px 0 32px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          style={{
            position: 'absolute',
            top: 14,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: colors.textPrimary,
            fontSize: 14,
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
