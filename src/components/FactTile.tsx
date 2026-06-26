import type { FactTile as FactTileData } from '../data/mock';

const STYLES: Record<FactTileData['accent'], { bg: string; border: string; num: string }> = {
  gold: { bg: 'bg-[rgba(203,168,92,0.07)]', border: 'border-[rgba(203,168,92,0.25)]', num: 'text-[#e2c988]' },
  coral: { bg: 'bg-[rgba(224,132,106,0.08)]', border: 'border-[rgba(224,132,106,0.22)]', num: 'text-[#d88870]' },
  neutral: { bg: 'bg-white/[0.03]', border: 'border-white/[0.07]', num: 'text-[#ede4c8]' },
};

export function FactTile({ fact }: { fact: FactTileData }) {
  const s = STYLES[fact.accent];
  return (
    <div className={`rounded-2xl ${s.bg} border ${s.border} p-5 flex flex-col gap-2`}>
      <div className={`text-4xl font-bold ${s.num}`}>{fact.count}</div>
      <div className="text-[#bcc5d6] text-sm">{fact.label}</div>
      <div className="font-mono-label text-[10px] tracking-[0.1em] text-[#5e677e] mt-1">
        {fact.mod}
      </div>
    </div>
  );
}
