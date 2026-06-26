import { colors } from '../tokens';

export type Lang = 'en' | 'zh';

interface LangToggleProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 12,
    letterSpacing: '0.08em',
    padding: '7px 16px',
    borderRadius: 7,
    cursor: 'pointer',
    border: 'none',
    transition: 'all .18s',
    background: active ? colors.goldBase : 'transparent',
    color: active ? colors.bgBase : '#7A7878',
    fontWeight: active ? 600 : 500,
  };
}

export function LangToggle({ lang, onChange }: LangToggleProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 9,
        padding: 2,
      }}
    >
      <button type="button" style={tabStyle(lang === 'en')} onClick={() => onChange('en')}>
        EN
      </button>
      <button type="button" style={tabStyle(lang === 'zh')} onClick={() => onChange('zh')}>
        中文
      </button>
    </div>
  );
}
