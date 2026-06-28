import React, { useState } from 'react';
import { BulkAnalysisData, BulkSegment } from '../types';
import { Users, Target, Palette, Copy, Check, FileText, Image as ImageIcon } from 'lucide-react';

interface BulkAnalysisCardProps {
  data: BulkAnalysisData;
}

const SegmentCard: React.FC<{ segment: BulkSegment }> = ({ segment }) => {
  const [contentCopied, setContentCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyContent = () => {
    navigator.clipboard.writeText(segment.contentDraft);
    setContentCopied(true);
    setTimeout(() => setContentCopied(false), 2000);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(segment.visuals.promptEn);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Segment Header */}
      <div className="bg-indigo-50/50 px-5 py-3 border-b border-indigo-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800">{segment.segmentName}</h3>
        </div>
        <span className="text-xs font-semibold bg-white text-indigo-600 px-2 py-1 rounded border border-indigo-100">
          {segment.countEstimation}
        </span>
      </div>

      <div className="p-5 space-y-6">
        {/* Strategy Section */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-1 min-w-[20px]">
              <Target className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">核心痛点 (Pain Point)</span>
              <p className="text-sm text-slate-700 font-medium">{segment.painPoint}</p>
            </div>
          </div>
          <div className="pl-8">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">iCare 策略</span>
            <p className="text-sm text-indigo-700 bg-indigo-50 p-2 rounded block">{segment.strategy}</p>
          </div>
        </div>

        {/* Visuals Section */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-purple-600" />
            <h4 className="text-sm font-bold text-slate-800">视觉指南 (Visual Direction)</h4>
          </div>
          
          <div className="bg-purple-50/30 rounded-lg p-3 mb-3">
             <p className="text-xs text-slate-600 mb-2">
               <ImageIcon className="w-3 h-3 inline mr-1 text-purple-500" /> 
               {segment.visuals.adviceCn}
             </p>
             <div className="relative group">
                <div className="absolute top-2 right-2 z-10">
                   <button 
                     onClick={handleCopyPrompt}
                     className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors shadow-sm"
                   >
                     {promptCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                     {promptCopied ? "Copied" : "Copy"}
                   </button>
                </div>
                <div className="bg-slate-900 text-slate-300 p-3 rounded font-mono text-[10px] leading-relaxed border border-slate-700">
                   <span className="text-purple-400 font-bold mr-1">PROMPT:</span>
                   {segment.visuals.promptEn}
                </div>
             </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
               <FileText className="w-4 h-4 text-emerald-600" />
               <h4 className="text-sm font-bold text-slate-800">
                 {segment.contentType === 'SCRIPT' ? '脚本草稿' : segment.contentType === 'EMAIL' ? '开发信草稿' : '贴文草稿'}
               </h4>
            </div>
            <button 
              onClick={handleCopyContent}
              className="text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1 text-xs"
            >
              {contentCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              复制内容
            </button>
          </div>
          <div className="bg-slate-50 p-3 rounded border border-slate-200 text-sm text-slate-700 whitespace-pre-line font-sans">
            {segment.contentDraft}
          </div>
        </div>
      </div>
    </div>
  );
};

const BulkAnalysisCard: React.FC<BulkAnalysisCardProps> = ({ data }) => {
  return (
    <div className="animate-fadeIn space-y-6">
      {/* Summary Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 border-b border-indigo-700 flex items-center gap-3">
          <Users className="w-6 h-6 text-white" />
          <h2 className="text-lg font-bold text-white">群体画像分析报告 (Intelligence Analysis)</h2>
        </div>
        <div className="p-6">
          <p className="text-slate-700 leading-relaxed font-medium">
            {data.overallSummary}
          </p>
        </div>
      </div>

      {/* Segments Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {data.segments.map((segment, index) => (
          <SegmentCard key={index} segment={segment} />
        ))}
      </div>
    </div>
  );
};

export default BulkAnalysisCard;