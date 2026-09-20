import React from 'react';
import { Ruler, ShoppingCart, FileSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@gci/i18n';

export type QuoteType = 'custom' | 'trade' | 'boq';

interface TypeSelectionProps {
  onSelect: (type: QuoteType) => void;
  onBack: () => void;
  projectName: string;
}

/** Step 2 — quote method. Compact workbench card: the stepper and the summary are rendered by the page around it. */
export const TypeSelection: React.FC<TypeSelectionProps> = ({ onSelect, onBack, projectName }) => {
  const { dict } = useI18n();
  const s = dict.quotation.typeSelection;

  const CARDS = [
    { type: 'custom' as const, icon: Ruler, ...s.custom },
    { type: 'boq' as const, icon: FileSearch, ...s.boq },
    { type: 'trade' as const, icon: ShoppingCart, ...s.trade },
  ];

  return (
    <section className="min-w-0 bg-white rounded-2xl border border-brand-beige p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#0C1B3A] leading-tight">{s.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{s.subtitle}</p>
          {projectName && <p className="text-[11px] font-bold text-[#8A6D1F] mt-1.5 truncate">{projectName}</p>}
        </div>
        <button
          onClick={onBack}
          className="shrink-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#0C1B3A]/40 hover:text-[#C9A84C] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> {s.backToProjectInfo.replace(/^←\s*/, '')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.type}
              onClick={() => onSelect(card.type)}
              className="group min-w-0 text-left p-4 bg-white border border-[#080D1E]/12 rounded-xl hover:border-[#CBA85C] hover:shadow-lg transition-all flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A6D1F] bg-[#CBA85C]/12 px-2 py-0.5 rounded-full">{card.tag}</span>
                <span className="w-8 h-8 rounded-lg bg-[#080D1E]/5 group-hover:bg-[#CBA85C]/15 flex items-center justify-center transition-colors shrink-0">
                  <Icon className="w-4 h-4 text-[#080D1E]/45 group-hover:text-[#8A6D1F] transition-colors" />
                </span>
              </div>

              <h3 className="text-sm font-black text-[#080D1E] leading-snug group-hover:text-[#8A6D1F] transition-colors">{card.title}</h3>
              <p className="text-[11px] text-[#080D1E]/60 leading-relaxed">{card.description}</p>

              <ol className="space-y-1">
                {card.flow.map((step, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#080D1E]/50 leading-snug">
                    <span className="w-3.5 h-3.5 mt-px rounded-full bg-[#080D1E]/8 flex items-center justify-center font-black text-[8px] shrink-0">{i + 1}</span>
                    <span className="min-w-0">{step}</span>
                  </li>
                ))}
              </ol>

              <span className="mt-auto pt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#8A6D1F]">
                {s.select.replace(/\s*→\s*$/, '')} <ChevronRight className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
