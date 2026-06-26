import { aLabel } from '../theme/accent';

export function StatusBar() {
  const now = new Date();
  const dateLine = now
    .toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .toUpperCase()
    .replace(/\//g, '.');

  return (
    <div
      className="flex items-center justify-between sticky top-0 z-10"
      style={{
        padding: '14px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.045)',
        background: 'rgba(6,11,24,0.7)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center" style={{ gap: 22 }}>
        <span className="font-mono-label" style={{ fontSize: 11, letterSpacing: '0.1em', color: aLabel }}>
          GCI UNIFIED · DAILY WORKSPACE
        </span>
        <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
        <span className="font-mono-label" style={{ fontSize: 11, color: '#505A70' }}>
          {dateLine}
        </span>
      </div>
      <div className="flex items-center" style={{ gap: 18 }}>
        <div
          className="flex items-center"
          style={{
            gap: 7,
            width: 200,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '7px 12px',
          }}
        >
          <span style={{ color: '#4A5268', fontSize: 13 }}>⌕</span>
          <span style={{ fontSize: 12, color: '#4A5268' }}>搜索…</span>
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#6FBF8E',
              animation: 'pulse 3s ease infinite',
            }}
          />
          <span className="font-mono-label" style={{ fontSize: 10.5, color: '#5A6A50' }}>
            已同步
          </span>
        </div>
      </div>
    </div>
  );
}
