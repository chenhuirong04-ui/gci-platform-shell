import type { FactTile } from '../data/mock';

export function FactCard({ fact, onClick }: { fact: FactTile; onClick: () => void }) {
  return (
    <div
      className="fact relative overflow-hidden"
      onClick={onClick}
      style={{
        background: `linear-gradient(160deg,${fact.bg1},${fact.bg2})`,
        border: `1px solid ${fact.border}`,
        borderRadius: 14,
        padding: '20px 18px 18px',
      }}
    >
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: 2, background: fact.line }}
      />
      <div
        className="font-mono-label uppercase"
        style={{ fontSize: 9, letterSpacing: '0.18em', color: fact.tagC, marginBottom: 14 }}
      >
        {fact.module}
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 44,
          fontWeight: 700,
          color: fact.numC,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {fact.count}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#A89878', marginTop: 10 }}>
        {fact.label}
      </div>
    </div>
  );
}
