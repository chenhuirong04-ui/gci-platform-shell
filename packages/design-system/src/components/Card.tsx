import type { ReactNode } from 'react';
import { colors } from '../tokens';

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: colors.bgSurface,
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
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
