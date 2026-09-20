import React from 'react';
import { useI18n } from '@gci/i18n';

export type QuoteType = 'custom' | 'package' | 'upload' | null;

interface Step {
  id: number;
  label: string;
}

interface StepIndicatorProps {
  current: number; // 1–5
}

/** One compact strip (~52px): current step = deep navy + gold, done = gold check, upcoming = muted. */
export const StepIndicator: React.FC<StepIndicatorProps> = ({ current }) => {
  const { dict } = useI18n();
  const s = dict.quotation.steps;
  const STEPS: Step[] = [
    { id: 1, label: s.projectInfo },
    { id: 2, label: s.quoteType },
    { id: 3, label: s.costInput },
    { id: 4, label: s.reviewMargin },
    { id: 5, label: s.sendToTrade },
  ];
  return (
    <nav aria-label="Quotation steps" className="w-full h-[52px] mb-3 flex items-center gap-1 px-2 sm:px-3 rounded-xl bg-[#080D1E]/[0.04] border border-[#080D1E]/10 overflow-hidden">
      {STEPS.map((step, idx) => {
        const done = current > step.id;
        const active = current === step.id;
        return (
          <React.Fragment key={step.id}>
            <div
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 h-9 px-2.5 sm:px-3 rounded-lg min-w-0 transition-colors ${active ? 'bg-[#080D1E] text-[#E8C96A] shadow-sm' : done ? 'text-[#A8842F]' : 'text-[#080D1E]/35'}`}
            >
              <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${active ? 'bg-[#CBA85C] text-[#080D1E]' : done ? 'bg-[#CBA85C]/25 text-[#A8842F]' : 'bg-[#080D1E]/8 text-[#080D1E]/40'}`}>
                {done ? '✓' : String(step.id).padStart(2, '0')}
              </span>
              <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wide truncate ${active ? 'inline' : 'hidden md:inline'}`}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && <div className={`h-px flex-1 min-w-[6px] ${done ? 'bg-[#CBA85C]' : 'bg-[#080D1E]/12'}`} />}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
