import type { ReactNode } from 'react';
import { colors, fonts } from '../tokens';

export type CardTone = 'dark' | 'light';

const TONE_STYLE: Record<CardTone, React.CSSProperties> = {
  dark: {
    background: colors.bgSurface,
    border: '1px solid rgba(255,255,255,0.07)',
  },
  // 'light' matches the existing white-card-on-light-bg pattern already used
  // across Trade OS / DEAL business pages (bg-white + border-gray-100 + shadow-sm).
  light: {
    background: '#ffffff',
    border: '1px solid #f3f4f6',
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  },
};

export function Card({
  children,
  tone = 'dark',
  hoverable = false,
  className,
  style,
  onClick,
}: {
  children: ReactNode;
  tone?: CardTone;
  /** Adds the lift+shadow hover treatment used across ProjectProgress/
   * QuotationModule cards (transition-all hover:shadow-md hover:-translate-y-0.5). */
  hoverable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      className={[className, hoverable ? 'transition-all hover:shadow-md hover:-translate-y-0.5' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      style={{
        borderRadius: 14,
        cursor: onClick ? 'pointer' : undefined,
        ...TONE_STYLE[tone],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface StatCardData {
  val: string;
  label: string;
  mod: string;
  mc: string;
  bg1: string;
  bg2: string;
  bdr: string;
  nc: string;
  line: string;
}

export interface StatCardIconProps {
  /** Icon-on-light-card variant — used by business pages (Control Center,
   * Cash Flow, Inventory, Trade Dashboard, etc.) for their top stat row.
   * Distinct from the `data`-based dark gradient variant below, which Home.tsx
   * already depends on and keeps its exact existing shape/behavior. */
  icon: ReactNode;
  label: string;
  /** Pass null to render a placeholder dash (matches the existing "sync not
   * run yet" convention several business pages already use). */
  value: ReactNode | null;
  /** Accent color for the icon, left bar, and icon chip background tint. */
  color: string;
  onClick?: () => void;
  className?: string;
}

export function StatCard(props: { data: StatCardData; onClick?: () => void } | StatCardIconProps) {
  if ('data' in props) {
    const { data, onClick } = props;
    return (
      <div
        className="fact relative overflow-hidden"
        onClick={onClick}
        style={{
          background: `linear-gradient(160deg,${data.bg1},${data.bg2})`,
          border: `1px solid ${data.bdr}`,
          borderRadius: 14,
          padding: '20px 18px 18px',
        }}
      >
        <div className="absolute bottom-0 left-0 right-0" style={{ height: 2, background: data.line }} />
        <div
          className="font-mono-label uppercase"
          style={{ fontSize: 9, letterSpacing: '0.18em', color: data.mc, marginBottom: 14 }}
        >
          {data.mod}
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 44,
            fontWeight: 700,
            color: data.nc,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {data.val}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginTop: 10 }}>
          {data.label}
        </div>
      </div>
    );
  }

  const { icon, label, value, color, onClick, className } = props;
  return (
    <div
      className={['relative overflow-hidden flex items-center gap-4', className].filter(Boolean).join(' ')}
      onClick={onClick}
      style={{
        background: '#ffffff',
        borderRadius: 18,
        border: `1px solid ${colors.bgBase}1F`,
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        padding: '20px 18px 18px',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div className="absolute left-0 top-0 bottom-0" style={{ width: 4, background: color }} />
      <div className="ml-1 rounded-xl" style={{ padding: 10, background: '#F8FAFC' }}>
        <div style={{ color }}>{icon}</div>
      </div>
      <div>
        <div style={{ fontFamily: fonts.display, fontSize: 24, fontWeight: 800, color: colors.bgBase, lineHeight: 1 }}>
          {value === null ? <span style={{ color: '#CBD5E1' }}>-</span> : value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: '#64748B' }}>{label}</div>
      </div>
    </div>
  );
}
