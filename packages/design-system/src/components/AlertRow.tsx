import { colors } from '../tokens';

export interface AlertRowData {
  dot: string;
  text: string;
  ref: string;
  src: string;
  sc: string;
  sb: string;
  action: string;
}

export function AlertRow({ data, onClick }: { data: AlertRowData; onClick?: () => void }) {
  return (
    <div
      className="al flex items-center"
      style={{ gap: 20, padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.045)', borderLeft: `3px solid ${data.dot}` }}
    >
      <div className="min-w-0" style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#EDE4C8', lineHeight: 1.35 }}>{data.text}</div>
        <div className="flex items-center" style={{ gap: 10, marginTop: 7 }}>
          <span className="font-mono-label" style={{ fontSize: 10.5, color: '#5E6878' }}>
            {data.ref}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#3A3428' }} />
          <span
            className="font-mono-label"
            style={{ fontSize: 9.5, letterSpacing: '0.1em', color: data.sc, background: data.sb, borderRadius: 5, padding: '2px 6px' }}
          >
            {data.src}
          </span>
        </div>
      </div>
      <span className="lk shrink-0 whitespace-nowrap" onClick={onClick} style={{ fontSize: 13, fontWeight: 600, color: colors.goldBase }}>
        {data.action} →
      </span>
    </div>
  );
}
