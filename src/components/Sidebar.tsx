import { systems } from '../config/systems';

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-white/[0.08] bg-[#0a1226] p-6 hidden md:flex md:flex-col">
      <div className="mb-10">
        <div className="font-mono-label text-[11px] tracking-[0.16em] text-[#5e677e]">
          GCI
        </div>
        <div className="text-[#e2c988] text-lg font-semibold mt-1">
          Platform Shell
        </div>
      </div>

      <div className="font-mono-label text-[10px] tracking-[0.16em] text-[#5e677e] mb-3">
        模块入口
      </div>
      <nav className="flex flex-col gap-2">
        {systems.map((s) => (
          <a
            key={s.code}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-sm text-[#bcc5d6] hover:border-white/[0.15] hover:bg-white/[0.04] transition-colors"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.accent }}
            />
            <span className="flex flex-col">
              <span className="font-medium text-[#dfe4ee]">{s.name}</span>
              <span className="text-[11px] text-[#8b95ad]">{s.role}</span>
            </span>
          </a>
        ))}
      </nav>

      <div className="mt-auto font-mono-label text-[10px] tracking-[0.16em] text-[#5e677e] pt-10">
        GCI ENTERPRISE OPERATING SYSTEM
      </div>
    </aside>
  );
}
