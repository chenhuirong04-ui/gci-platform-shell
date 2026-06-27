import type { ReactNode } from 'react';
import { colors } from '../tokens';

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
  className,
  style,
}: {
  children: ReactNode;
  tone?: CardTone;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 14,
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

export function StatCard({ data, onClick }: { data: StatCardData; onClick?: () => void }) {
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
          fontFamily: "'Space Grotesk',sans-serif",
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
