import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fonts } from '../tokens';

/** Design System V1 workspace font: Latin in Space Grotesk, CJK falls through to Noto Sans SC. */
export const workspaceFontFamily = `'Space Grotesk', ${fonts.body}`;

/**
 * Renders a modal into <body>. The Shell's <main> keeps a transform after its
 * fadeUp animation, which makes `position: fixed` relative to <main> instead of
 * the viewport (the overlay misses the header and the panel can run off-screen).
 * The wrapper re-applies the workspace font and the no-translate marker that a
 * module root normally provides.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div translate="no" className="notranslate" style={{ fontFamily: workspaceFontFamily }}>{children}</div>,
    document.body,
  );
}
