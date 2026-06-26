export function TopBar() {
  const today = new Date();
  const dateLabel = today.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <header className="flex items-center justify-between border-b border-white/[0.08] px-8 py-5">
      <div>
        <div className="text-[#e2c988] text-xl font-semibold">Daily Workspace</div>
        <div className="text-[#8b95ad] text-sm mt-1">{dateLabel}</div>
      </div>
      <div className="font-mono-label text-[11px] tracking-[0.16em] text-[#5e677e] text-right">
        GCI PLATFORM SHELL<br />PHASE 1 · MOCK DATA
      </div>
    </header>
  );
}
