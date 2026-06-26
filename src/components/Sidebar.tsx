import { navTop, navMods, type NavItem } from '../config/navigation';

const ACCENT_TEXT: Record<string, string> = {
  gold: 'text-[#e2c988]',
  coral: 'text-[#d0907a]',
  neutral: 'text-[#a89878]',
};

const ACCENT_BG: Record<string, string> = {
  gold: 'bg-[rgba(203,168,92,0.16)]',
  coral: 'bg-[rgba(224,132,106,0.14)]',
  neutral: 'bg-white/[0.07]',
};

function ModRow({ item }: { item: NavItem }) {
  const inner = (
    <>
      <span className="font-mono-label text-[10px] text-[#5e677e] w-5 shrink-0">
        {item.code}
      </span>
      <span
        className={`flex-1 text-sm ${
          item.kind === 'soon' ? 'text-[#5e677e]' : 'text-[#dfe4ee]'
        }`}
      >
        {item.name}
      </span>
      {item.count && (
        <span
          className={`font-mono-label text-[11px] rounded px-1.5 py-0.5 ${
            ACCENT_BG[item.accent ?? 'neutral']
          } ${ACCENT_TEXT[item.accent ?? 'neutral']}`}
        >
          {item.count}
        </span>
      )}
      {item.kind === 'soon' && (
        <span className="font-mono-label text-[9px] tracking-wide text-[#5e677e] border border-white/[0.08] rounded px-1.5 py-0.5">
          即将上线
        </span>
      )}
    </>
  );

  const className =
    'flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors';

  if (item.kind === 'external') {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hover:bg-white/[0.04]`}
      >
        {inner}
      </a>
    );
  }

  return (
    <div className={`${className} opacity-60 cursor-default`}>{inner}</div>
  );
}

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-white/[0.07] bg-[#060b18] p-5 hidden md:flex md:flex-col">
      <div className="flex items-center gap-3 mb-8 px-1">
        <div className="w-9 h-9 rounded-[9px] bg-[#cba85c] flex items-center justify-center text-[#080d1e] font-bold text-sm">
          G
        </div>
        <div>
          <div className="font-mono-label text-[10px] tracking-[0.16em] text-[#cba85c]">
            GCI UNIFIED
          </div>
          <div className="text-[#f0ead2] text-sm font-semibold">Platform</div>
        </div>
      </div>

      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-5 bg-[rgba(203,168,92,0.10)] border border-[rgba(203,168,92,0.28)]"
      >
        <span className="font-mono-label text-[10px] text-[#5e677e] w-5 shrink-0">
          {navTop.code}
        </span>
        <span className="text-sm text-[#f0ead2] font-medium">{navTop.name}</span>
      </div>

      <div className="font-mono-label text-[10px] tracking-[0.16em] text-[#5e677e] mb-2 px-1">
        模块
      </div>
      <nav className="flex flex-col gap-1">
        {navMods.map((item) => (
          <ModRow key={item.code} item={item} />
        ))}
      </nav>

      <div className="mt-auto font-mono-label text-[9px] tracking-[0.16em] text-[#5e677e] pt-10">
        GCI ENTERPRISE OPERATING SYSTEM
      </div>
    </aside>
  );
}
