import type { SystemEntry } from '../config/systems';

export function SystemEntryCard({ system }: { system: SystemEntry }) {
  return (
    <a
      href={system.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-white/[0.07] bg-[#101a30] p-5 transition-colors hover:border-white/[0.18]"
      style={{ borderTopColor: system.accent, borderTopWidth: 2 }}
    >
      <div className="font-mono-label text-[10px] tracking-[0.16em] text-[#5e677e] mb-2">
        {system.code}
      </div>
      <div className="text-[#e2c988] font-semibold mb-1">{system.name}</div>
      <div className="text-[#8b95ad] text-xs mb-4">{system.role}</div>
      <div className="text-[#bcc5d6] text-xs font-mono-label tracking-wide">
        打开 →
      </div>
    </a>
  );
}
