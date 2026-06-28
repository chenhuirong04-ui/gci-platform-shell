import React from 'react';
import { Ruler, ShoppingCart, FileSearch } from 'lucide-react';
import { StepIndicator } from './StepIndicator';

export type QuoteType = 'custom' | 'trade' | 'boq';

interface TypeCard {
  type: QuoteType;
  icon: React.FC<{ className?: string }>;
  title: string;
  titleZh: string;
  tag: string;
  description: string;
  descriptionZh: string;
  examples: string[];
  flow: string[];
}

const CARDS: TypeCard[] = [
  {
    type: 'custom',
    icon: Ruler,
    title: 'Custom Item Quote',
    titleZh: '单品定制报价',
    tag: 'Path 1',
    description: 'Quote a single custom-made furniture item with full BOM & engineering calculation.',
    descriptionZh: '为单一定制产品生成工程报价，含BOM材料计算',
    examples: ['Sofa / 沙发', 'Bed / 床', 'Wardrobe / 衣柜', 'Table / 桌椅', 'TV Unit / 电视柜'],
    flow: ['Configure item', 'BOM auto-calc', 'Set margin', 'PDF + Send to TRADE'],
  },
  {
    type: 'trade',
    icon: ShoppingCart,
    title: 'Trade & Sourcing Quote',
    titleZh: '贸易采购报价',
    tag: 'Path 2',
    description: 'Upload supplier costs, input your selling price, system calculates profit & VAT automatically.',
    descriptionZh: '上传供应商报价，手工定价，系统自动计算利润',
    examples: ['Furniture Projects / 家具项目', 'Tissue / 纸巾', 'Coffee / 咖啡', 'Sanitary / 卫生用品', 'Building Materials / 建材', 'AI Devices / AI设备'],
    flow: ['Upload supplier quote', 'AI cost recognition', 'Input selling price', 'PDF + Send to TRADE'],
  },
  {
    type: 'boq',
    icon: FileSearch,
    title: 'BOQ & AI Analysis',
    titleZh: 'BOQ / 图纸 AI 分析',
    tag: 'Path 3',
    description: 'Upload BOQ, drawings or requirement PDFs. AI extracts item list — then route to Trade & Sourcing for pricing.',
    descriptionZh: '上传BOQ/图纸/需求文件，AI提取清单，转入Trade报价流程',
    examples: ['BOQ / 工程量清单', 'Drawings / 图纸', 'Project PDF', 'Requirement List / 需求清单'],
    flow: ['Upload BOQ / drawing', 'AI item extraction', 'Review draft list', '→ Trade & Sourcing pricing'],
  },
];

interface TypeSelectionProps {
  onSelect: (type: QuoteType) => void;
  onBack: () => void;
  projectName: string;
}

export const TypeSelection: React.FC<TypeSelectionProps> = ({ onSelect, onBack, projectName }) => (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
    <StepIndicator current={2} />

    {/* Header */}
    <div className="text-center space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#CBA85C]" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
        {projectName}
      </p>
      <h2 className="text-3xl font-semibold" style={{ fontFamily: "'Space Grotesk',sans-serif", color: '#080D1E' }}>Choose Quote Type</h2>
      <p className="text-xs text-[#080D1E]/50 font-medium">
        Select the path that matches your current task · 选择对应业务路径
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
              <p className="text-[10px] text-[#080D1E]/40 font-bold mt-0.5">{card.titleZh}</p>
            </div>

            {/* Description */}
            <p className="text-[11px] text-[#080D1E]/60 leading-relaxed flex-1">
              {card.description}
              <br />
              <span className="text-[#080D1E]/35">{card.descriptionZh}</span>
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
              Select → 进入
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
        ← Back to Project Info
      </button>
    </div>
  </div>
);
