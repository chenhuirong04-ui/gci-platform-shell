/**
 * Design System V1 — shared supplier-library UI styles.
 * Inputs, labels, tabs and modals were each re-declared per component with
 * slightly different radii / borders / overlays; they all come from here now.
 */
import type React from 'react';
import { createPortal } from 'react-dom';
import { workspace, fonts, fontSizes, radii, zIndex } from '@gci/design-system';

/** Same stack as the module root (SuppliersModule): Latin in Space Grotesk, CJK in Noto Sans SC. */
const UI_FONT = `'Space Grotesk', ${fonts.body}`;

/** Neutral input outline (kept from the existing inputs). */
const INPUT_BORDER = '#b0bec5';

export const INPUT: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: radii.sm, border: `1px solid ${INPUT_BORDER}`,
  fontSize: fontSizes.md, color: workspace.textPrimary, background: '#fff', outline: 'none',
};

export const LABEL: React.CSSProperties = {
  display: 'block', fontSize: fontSizes.xs, fontWeight: 600, color: '#475569', marginBottom: 6,
};

/** Underline tab: navy text + accent underline when active. */
export const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 18px', fontSize: fontSizes.sm, fontWeight: active ? 700 : 500,
  color: active ? workspace.textPrimary : '#475569',
  border: 'none', borderBottom: `2px solid ${active ? workspace.accent : 'transparent'}`,
  background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -1, transition: 'color .15s',
});

/** Two/three-column form rows that collapse to fewer columns on narrow screens. */
export const formGrid = (minCol: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minCol}px), 1fr))`,
});

export const MODAL_OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: zIndex.modal, background: 'rgba(8,13,30,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

/** Form modals: full screen below 640px, a centred card (≤85vh, 16px gutter) from 640px up. */
export const MODAL_PANEL_CLASS = 'w-full h-full rounded-none sm:h-auto sm:max-h-[85vh] sm:w-[calc(100%-32px)] sm:rounded-[14px]';

export const modalPanel = (maxWidth: number): React.CSSProperties => ({
  background: '#fff', padding: 24, maxWidth, overflowY: 'auto', boxSizing: 'border-box',
  boxShadow: '0 20px 60px rgba(8,13,30,0.2)',
});

/**
 * Renders a modal into <body>. The Shell's <main> keeps a transform after its
 * fadeUp animation, which makes `position: fixed` relative to <main> instead of
 * the viewport (the overlay would miss the sidebar/header and the panel would sit
 * off-centre). The wrapper carries the module font and the no-translate marker
 * that the module root normally provides.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div translate="no" className="notranslate" style={{ fontFamily: UI_FONT }}>{children}</div>,
    document.body,
  );
}
