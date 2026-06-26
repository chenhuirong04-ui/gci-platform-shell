import type { PriorityAlert } from '../data/mock';

const SEVERITY_DOT: Record<PriorityAlert['severity'], string> = {
  high: '#e0846a',
  mid: '#d9b45a',
  low: '#6fbf8e',
};

const SOURCE_STYLE: Record<PriorityAlert['source'], { color: string; bg: string }> = {
  QUOTATION: { color: '#b89ab0', bg: 'rgba(182,155,208,0.14)' },
  FINANCE: { color: '#c0a868', bg: 'rgba(192,168,104,0.14)' },
  TRADE: { color: '#8090b0', bg: 'rgba(128,144,176,0.14)' },
  CRM: { color: '#887860', bg: 'rgba(136,120,96,0.14)' },
};

export function AlertItem({ alert }: { alert: PriorityAlert }) {
  const src = SOURCE_STYLE[alert.source];
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-b-0">
      <span
        className="mt-1.5 w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: SEVERITY_DOT[alert.severity] }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[#dfe4ee] text-sm">{alert.text}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="font-mono-label text-[10px] tracking-[0.08em] rounded px-1.5 py-0.5"
            style={{ color: src.color, backgroundColor: src.bg }}
          >
            {alert.source}
          </span>
          <span className="font-mono-label text-[10px] text-[#5e677e]">{alert.ref}</span>
        </div>
      </div>
      <span className="font-mono-label text-[11px] text-[#cba85c] shrink-0 mt-1">
        {alert.action} →
      </span>
    </div>
  );
}
