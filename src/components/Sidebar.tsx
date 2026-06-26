import { navTop, navMods } from '../config/navigation';
import { aLogoBg, aNavBg, aNavBd } from '../theme/accent';

export function Sidebar({ onSoonClick }: { onSoonClick: (name: string) => void }) {
  return (
    <aside
      className="shrink-0 hidden md:flex md:flex-col relative"
      style={{
        width: 222,
        background: '#060B18',
        borderRight: '1px solid rgba(255,255,255,0.055)',
        padding: '22px 14px',
      }}
    >
      <div
        className="absolute"
        style={{
          top: '20%',
          right: 0,
          width: 1,
          height: '60%',
          background:
            'linear-gradient(180deg,transparent,rgba(203,168,92,0.25),transparent)',
        }}
      />

      <div
        className="flex items-center"
        style={{
          gap: 11,
          padding: '4px 8px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 20,
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: aLogoBg,
            fontFamily: "'Space Grotesk',sans-serif",
            fontWeight: 700,
            fontSize: 14,
            color: '#080D1E',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          G
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 14.5,
              fontWeight: 600,
              color: '#F0EAD2',
              lineHeight: 1.1,
            }}
          >
            GCI Platform
          </div>
          <div
            className="font-mono-label"
            style={{ fontSize: 9, letterSpacing: '0.16em', color: '#505A70', marginTop: 2 }}
          >
            UNIFIED · v1
          </div>
        </div>
      </div>

      <div
        className="font-mono-label"
        style={{ fontSize: 8.5, letterSpacing: '0.2em', color: '#4A5268', padding: '0 8px 8px' }}
      >
        WORKSPACE
      </div>
      <div
        className="nv flex items-center"
        style={{
          gap: 11,
          padding: '10px 11px',
          borderRadius: 10,
          marginBottom: 3,
          background: aNavBg,
          border: `1px solid ${aNavBd}`,
        }}
      >
        <span
          className="font-mono-label flex items-center justify-center shrink-0"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            fontSize: 9.5,
            fontWeight: 600,
            color: '#080D1E',
            background: aLogoBg,
          }}
        >
          {navTop.code}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#F0EAD2', flex: 1 }}>
          {navTop.name}
        </span>
      </div>

      <div
        className="font-mono-label"
        style={{ fontSize: 8.5, letterSpacing: '0.2em', color: '#4A5268', padding: '16px 8px 8px' }}
      >
        MODULES
      </div>
      <nav>
        {navMods.map((n) => {
          const inner = (
            <>
              <span
                className="font-mono-label flex items-center justify-center shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: '#9AAABA',
                  background: 'rgba(255,255,255,0.08)',
                }}
              >
                {n.code}
              </span>
              <span style={{ fontSize: 13, color: '#D0CBC0', flex: 1 }}>{n.name}</span>
              {n.count && (
                <span
                  className="font-mono-label"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: n.badgeColor,
                    background: n.badgeBg,
                    borderRadius: 8,
                    minWidth: 20,
                    textAlign: 'center',
                    padding: '1px 5px',
                  }}
                >
                  {n.count}
                </span>
              )}
            </>
          );

          const rowStyle = {
            gap: 11,
            padding: '9px 11px',
            borderRadius: 9,
            marginBottom: 2,
          };

          if (n.url) {
            return (
              <a
                key={n.code}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="nv flex items-center"
                style={rowStyle}
              >
                {inner}
              </a>
            );
          }

          return (
            <div
              key={n.code}
              className="nv flex items-center"
              style={rowStyle}
              onClick={() => onSoonClick(n.name)}
            >
              {inner}
            </div>
          );
        })}
      </nav>

      <div
        className="flex items-center"
        style={{
          marginTop: 'auto',
          gap: 10,
          padding: '11px 12px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 11,
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#3D5288,#2A3A60)',
            fontWeight: 600,
            fontSize: 12,
            color: '#A0B0D4',
          }}
        >
          C
        </div>
        <div className="min-w-0" style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#D8D0B8', lineHeight: 1.1 }}>
            Chris
          </div>
          <div style={{ fontSize: 10, color: '#505A70', marginTop: 1 }}>Owner · GCI</div>
        </div>
        <span style={{ color: '#4A5268', fontSize: 14 }}>⚙</span>
      </div>
    </aside>
  );
}
