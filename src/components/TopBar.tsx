import { summaryLine } from '../data/mock';

function getGreeting(hour: number) {
  if (hour < 5) return '凌晨好';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function TopBar() {
  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const dateLine = now
    .toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .toUpperCase()
    .replace(/\//g, '.');

  return (
    <header className="border-b border-white/[0.07] px-8 py-5">
      <div className="font-mono-label text-[11px] tracking-[0.16em] text-[#cba85c] mb-3">
        GCI UNIFIED · DAILY WORKSPACE
      </div>
      <div className="flex items-baseline gap-3">
        <h1 className="text-[#f0ead2] text-2xl font-semibold m-0">{greeting}，Chris</h1>
        <span className="font-mono-label text-[11px] text-[#5e677e]">{dateLine}</span>
      </div>
      <p className="text-[#a89878] text-sm mt-2 max-w-2xl">{summaryLine}</p>
    </header>
  );
}
