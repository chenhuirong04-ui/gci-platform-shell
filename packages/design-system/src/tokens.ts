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

/** 8 business statuses mapped onto the 5 status colors — per V1 "Notes for Claude Code": map centrally, never inline in pages. */
export type StatusKey =
  | 'newInquiry'
  | 'inProgress'
  | 'quoted'
  | 'confirmed'
  | 'overdue'
  | 'inProduction'
  | 'shipped'
  | 'paid';

export const statusMap: Record<StatusKey, { color: string; bg: string }> = {
  newInquiry: { color: colors.statusInfo, bg: 'rgba(143,166,212,0.16)' },
  inProgress: { color: colors.statusWarning, bg: 'rgba(217,180,90,0.16)' },
  quoted: { color: colors.statusPurple, bg: 'rgba(182,155,208,0.16)' },
  confirmed: { color: colors.statusSuccess, bg: 'rgba(111,191,142,0.16)' },
  overdue: { color: colors.statusDanger, bg: 'rgba(224,132,106,0.16)' },
  inProduction: { color: colors.statusWarning, bg: 'rgba(217,180,90,0.16)' },
  shipped: { color: colors.statusInfo, bg: 'rgba(143,166,212,0.16)' },
  paid: { color: colors.statusSuccess, bg: 'rgba(111,191,142,0.16)' },
};
