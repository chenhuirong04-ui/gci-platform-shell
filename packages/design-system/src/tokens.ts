export const colors = {
  bgBase: '#080D1E',
  bgShell: '#060B18',
  bgSurface: '#0F1830',
  bgRaised: '#162040',
  goldStrong: '#E2C988',
  goldBase: '#CBA85C',
  goldMuted: '#A07F3C',
  textPrimary: '#F0EAD2',
  textSecondary: '#C8BDA8',
  textMuted: '#8A8070',
  statusSuccess: '#6FBF8E',
  statusWarning: '#D9B45A',
  statusDanger: '#E0846A',
  statusInfo: '#8FA6D4',
  statusPurple: '#B69BD0',
  /** Neutral/paused state — not a brand color, just the same gray every
   * business page already uses for "inactive" (was hardcoded as #94A3B8
   * in several places before being centralized here). */
  statusNeutral: '#94A3B8',
};

export const fonts = {
  display: "'Space Grotesk', sans-serif",
  body: "'Noto Sans SC', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

export const layout = {
  sidebarWidth: 222,
  headerHeight: 52,
  canvasWidth: 1440,
  contentMaxWidth: 920,
  pagePadding: 48,
  sectionGap: 72,
};

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
};

export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

export const logoGradient = `linear-gradient(135deg,${colors.goldStrong},${colors.goldMuted})`;

/** Business statuses mapped onto the 5 status colors — per V1 "Notes for
 * Claude Code": map centrally, never inline in pages. Extended for
 * ActionCenter's 5 action-priority categories (urgent/waitingSupplier/
 * waitingClient/paused/otherInquiry) — each aliases an existing status
 * color rather than introducing a new one (paused aliases the neutral gray
 * every business page already used, just centralized here instead of
 * re-hardcoded per file). */
export type StatusKey =
  | 'newInquiry'
  | 'inProgress'
  | 'quoted'
  | 'confirmed'
  | 'overdue'
  | 'inProduction'
  | 'shipped'
  | 'paid'
  | 'urgent'
  | 'waitingSupplier'
  | 'waitingClient'
  | 'paused'
  | 'otherInquiry'
  /** Gold/brand highlight — used for AI-assist sections, not a business state. */
  | 'ai';

export const statusMap: Record<StatusKey, { color: string; bg: string; cardBg: string }> = {
  newInquiry: { color: colors.statusInfo, bg: 'rgba(143,166,212,0.16)', cardBg: 'rgba(143,166,212,0.05)' },
  inProgress: { color: colors.statusWarning, bg: 'rgba(217,180,90,0.16)', cardBg: 'rgba(217,180,90,0.05)' },
  quoted: { color: colors.statusPurple, bg: 'rgba(182,155,208,0.16)', cardBg: 'rgba(182,155,208,0.05)' },
  confirmed: { color: colors.statusSuccess, bg: 'rgba(111,191,142,0.16)', cardBg: 'rgba(111,191,142,0.05)' },
  overdue: { color: colors.statusDanger, bg: 'rgba(224,132,106,0.16)', cardBg: 'rgba(224,132,106,0.05)' },
  inProduction: { color: colors.statusWarning, bg: 'rgba(217,180,90,0.16)', cardBg: 'rgba(217,180,90,0.05)' },
  shipped: { color: colors.statusInfo, bg: 'rgba(143,166,212,0.16)', cardBg: 'rgba(143,166,212,0.05)' },
  paid: { color: colors.statusSuccess, bg: 'rgba(111,191,142,0.16)', cardBg: 'rgba(111,191,142,0.05)' },
  urgent: { color: colors.statusDanger, bg: 'rgba(224,132,106,0.16)', cardBg: 'rgba(224,132,106,0.05)' },
  waitingSupplier: { color: colors.statusWarning, bg: 'rgba(217,180,90,0.16)', cardBg: 'rgba(217,180,90,0.05)' },
  waitingClient: { color: colors.statusInfo, bg: 'rgba(143,166,212,0.16)', cardBg: 'rgba(143,166,212,0.05)' },
  paused: { color: colors.statusNeutral, bg: 'rgba(148,163,184,0.16)', cardBg: 'rgba(148,163,184,0.05)' },
  otherInquiry: { color: colors.statusPurple, bg: 'rgba(182,155,208,0.16)', cardBg: 'rgba(182,155,208,0.05)' },
  ai: { color: colors.goldBase, bg: 'rgba(203,168,92,0.16)', cardBg: 'rgba(203,168,92,0.08)' },
};
