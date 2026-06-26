import type { PriorityAlert } from '../data/mock';
import { aAlertLk } from '../theme/accent';

export function AlertRow({ alert, onClick }: { alert: PriorityAlert; onClick: () => void }) {
  return (
    <div
      className="al flex items-center"
      style={{
        gap: 20,
        padding: '18px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.045)',
        borderLeft: `3px solid ${alert.dot}`,
      }}
    >
      <div className="min-w-0" style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#EDE4C8', lineHeight: 1.35 }}>
          {alert.text}
        </div>
        <div className="flex items-center" style={{ gap: 10, marginTop: 7 }}>
          <span className="font-mono-label" style={{ fontSize: 10.5, color: '#5E6878' }}>
            {alert.ref}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#3A3428' }} />
          <span
            className="font-mono-label"
            style={{
              fontSize: 9.5,
              letterSpacing: '0.1em',
              color: alert.sc,
              background: alert.sb,
              borderRadius: 5,
              padding: '2px 6px',
            }}
          >
            {alert.source}
          </span>
        </div>
      </div>
      <span
        className="lk shrink-0 whitespace-nowrap"
        onClick={onClick}
        style={{ fontSize: 13, fontWeight: 600, color: aAlertLk }}
      >
        {alert.action} →
      </span>
    </div>
  );
}
