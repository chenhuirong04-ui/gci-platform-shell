export interface QuickActionData {
  label: string;
  icon: string;
  ib: string;
  ic: string;
  is: string;
}

export function QuickActionCard({ data, onClick }: { data: QuickActionData; onClick?: () => void }) {
  return (
    <div
      className="qa flex items-center"
      onClick={onClick}
      style={{ gap: 13, padding: '18px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 13, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: 34, height: 34, borderRadius: 9, background: data.ib, fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: data.ic, boxShadow: data.is }}
      >
        {data.icon}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#D8D0B8' }}>{data.label}</span>
    </div>
  );
}
