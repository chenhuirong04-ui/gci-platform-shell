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
  <div className="w-full mb-8">
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, idx) => {
        const done    = current > step.id;
        const active  = current === step.id;
        const pending = current < step.id;
        return (
          <React.Fragment key={step.id}>
            {/* Node */}
            <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black transition-all
                ${done    ? 'bg-[#CBA85C] text-[#080D1E]' : ''}
                ${active  ? 'bg-[#080D1E] text-[#CBA85C] ring-2 ring-[#CBA85C]/40 ring-offset-1' : ''}
                ${pending ? 'bg-white border-2 border-[#080D1E]/15 text-[#080D1E]/30' : ''}
              `}>
                {done ? '✓' : step.id}
              </div>
              <div className="text-center" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
                <p className={`text-[9px] font-black uppercase tracking-wider leading-none ${active ? 'text-[#080D1E]' : done ? 'text-[#CBA85C]' : 'text-[#080D1E]/30'}`}>
                  {step.label}
                </p>
              </div>
            </div>
            {/* Connector */}
            {idx < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-5 transition-all ${done ? 'bg-[#CBA85C]' : 'bg-[#080D1E]/10'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
  );
};
