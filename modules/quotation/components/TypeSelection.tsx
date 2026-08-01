import React from 'react';
import { Ruler, ShoppingCart, FileSearch } from 'lucide-react';
import { useI18n } from '@gci/i18n';
import { StepIndicator } from './StepIndicator';

export type QuoteType = 'custom' | 'trade' | 'boq';

interface TypeSelectionProps {
  onSelect: (type: QuoteType) => void;
  onBack: () => void;
  projectName: string;
}

export const TypeSelection: React.FC<TypeSelectionProps> = ({ onSelect, onBack, projectName }) => {
  const { dict } = useI18n();
  const s = dict.quotation.typeSelection;

  const CARDS = [
    { type: 'custom' as const, icon: Ruler, ...s.custom },
    { type: 'trade' as const, icon: ShoppingCart, ...s.trade },
    { type: 'boq' as const, icon: FileSearch, ...s.boq },
  ];

  return (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
    <StepIndicator current={2} />

    {/* Header */}
    <div className="text-center space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#CBA85C]" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
        {projectName}
      </p>
      <h2 className="text-3xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#080D1E' }}>{s.title}</h2>
      <p className="text-xs text-[#080D1E]/50 font-medium">
        {s.subtitle}
      </p>
    </div>

    {/* Path Cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-5xl mx-auto">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.type}
            onClick={() => onSelect(card.type)}
            className="group text-left p-8 bg-white border-2 border-[#080D1E]/8 rounded-[32px] hover:border-[#CBA85C] hover:shadow-2xl hover:-translate-y-1 transition-all duration-400 flex flex-col gap-5"
          >
            {/* Tag + Icon */}
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#CBA85C] bg-[#CBA85C]/10 px-2 py-1 rounded-full">
                {card.tag}
              </span>
              <div className="w-10 h-10 rounded-2xl bg-[#080D1E]/5 group-hover:bg-[#CBA85C]/10 flex items-center justify-center transition-colors">
                <Icon className="w-5 h-5 text-[#080D1E]/40 group-hover:text-[#CBA85C] transition-colors" />
              </div>
            </div>

            {/* Title */}
            <div>
              <h3 className="text-base font-semibold text-[#080D1E] leading-tight group-hover:text-[#CBA85C] transition-colors" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
                {card.title}
              </h3>
            </div>

            {/* Description */}
            <p className="text-[11px] text-[#080D1E]/60 leading-relaxed flex-1">
              {card.description}
            </p>

            {/* Flow steps */}
            <div className="space-y-1 mt-1">
              {card.flow.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[9px] text-[#080D1E]/40">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#080D1E]/8 flex items-center justify-center font-black text-[7px] shrink-0">{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>

            {/* Examples */}
            <div className="flex flex-wrap gap-1.5">
              {card.examples.slice(0, 4).map(ex => (
                <span key={ex} className="text-[8px] font-bold text-[#080D1E]/40 bg-[#080D1E]/4 px-2 py-0.5 rounded-full">
                  {ex}
                </span>
              ))}
              {card.examples.length > 4 && (
                <span className="text-[8px] font-bold text-[#080D1E]/30 px-1">+{card.examples.length - 4}</span>
              )}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#CBA85C] opacity-0 group-hover:opacity-100 transition-opacity">
              {s.select}
            </div>
          </button>
        );
      })}
    </div>

    {/* Back */}
    <div className="flex justify-center pt-2">
      <button
        onClick={onBack}
        className="text-[10px] font-black uppercase tracking-widest text-[#080D1E]/30 hover:text-[#080D1E] transition-colors flex items-center gap-2"
      >
        {s.backToProjectInfo}
      </button>
    </div>
  </div>
  );
};
