import React, { useState } from 'react';
import { SocialContent, VisualGuide } from '../types';
import { Linkedin, Instagram, Video, Copy, Check, Globe, Facebook, Palette, Image as ImageIcon } from 'lucide-react';

interface SocialMediaCardProps {
  data: SocialContent;
}

const SocialMediaCard: React.FC<SocialMediaCardProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'linkedin' | 'instagram' | 'facebook' | 'tiktok'>('linkedin');
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const VisualSection: React.FC<{ visual: VisualGuide }> = ({ visual }) => (
    <div className="mt-8 border-t border-slate-200 pt-6 animate-fadeIn">
       <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
         <Palette className="w-4 h-4 text-purple-600" />
         视觉指南 (Visual Direction)
       </h3>
       
       <div className="grid gap-4 md:grid-cols-1">
          {/* Advice */}
          <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100">
             <div className="flex items-center gap-2 mb-2">
               <ImageIcon className="w-3 h-3 text-purple-500" />
               <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">拍摄与设计建议</span>
             </div>
             <p className="text-slate-700 text-sm leading-relaxed">{visual.adviceCn}</p>
          </div>

          {/* Prompt */}
          <div className="relative group">
            <div className="absolute top-2 right-2 z-10">
               <button 
                 onClick={() => handleCopyPrompt(visual.promptEn)}
                 className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors shadow-sm"
               >
                 {promptCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                 {promptCopied ? "Copied" : "Copy Prompt"}
               </button>
            </div>
            <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto border border-slate-700 shadow-inner">
               <span className="text-purple-400 select-none mr-2 font-bold uppercase tracking-wider text-[10px]">PROMPT:</span>
               <span className="text-slate-100">{visual.promptEn}</span>
            </div>
          </div>
       </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'linkedin':
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-semibold text-blue-800 bg-blue-100 px-2 py-1 rounded">English Draft (B2B Professional)</span>
                <button 
                  onClick={() => handleCopy(data.linkedin.contentEn + '\n\n' + data.linkedin.hashtags.join(' '))}
                  className="text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 text-xs"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Copy English
                </button>
              </div>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed font-sans text-base">{data.linkedin.contentEn}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.linkedin.hashtags.map((tag, i) => (
                  <span key={i} className="text-blue-600 text-sm hover:underline cursor-pointer">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                ))}
              </div>
            </div>

            <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-lg">
               <div className="flex items-center gap-2 mb-2">
                 <Globe className="w-3 h-3 text-slate-400" />
                 <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">中文翻译 (仅供参考)</span>
               </div>
               <p className="text-slate-600 whitespace-pre-line leading-relaxed text-sm">{data.linkedin.contentCn}</p>
            </div>

            <VisualSection visual={data.linkedin.visual} />
          </div>
        );
      case 'instagram':
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-br from-pink-50 to-orange-50 border border-pink-100 p-5 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-semibold text-pink-800 bg-pink-100 px-2 py-1 rounded">English Draft (Visual / Lifestyle)</span>
                <button 
                   onClick={() => handleCopy(data.instagram.contentEn + '\n\n' + data.instagram.hashtags.join(' '))}
                  className="text-slate-400 hover:text-pink-600 transition-colors flex items-center gap-1 text-xs"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Copy English
                </button>
              </div>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed text-base">{data.instagram.contentEn}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.instagram.hashtags.map((tag, i) => (
                  <span key={i} className="text-pink-600 text-sm font-medium">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                ))}
              </div>
            </div>

            <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-lg">
               <div className="flex items-center gap-2 mb-2">
                 <Globe className="w-3 h-3 text-slate-400" />
                 <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">中文翻译 (仅供参考)</span>
               </div>
               <p className="text-slate-600 whitespace-pre-line leading-relaxed text-sm">{data.instagram.contentCn}</p>
            </div>

            <VisualSection visual={data.instagram.visual} />
          </div>
        );
      case 'facebook':
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-blue-50/30 border border-blue-200 p-5 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-semibold text-blue-900 bg-blue-100 px-2 py-1 rounded">English Draft (Community & Trust)</span>
                <button 
                   onClick={() => handleCopy(data.facebook.contentEn + '\n\n' + data.facebook.hashtags.join(' '))}
                  className="text-slate-400 hover:text-blue-700 transition-colors flex items-center gap-1 text-xs"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Copy English
                </button>
              </div>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed text-base">{data.facebook.contentEn}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.facebook.hashtags.map((tag, i) => (
                  <span key={i} className="text-blue-700 text-sm font-medium">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                ))}
              </div>
            </div>

            <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-lg">
               <div className="flex items-center gap-2 mb-2">
                 <Globe className="w-3 h-3 text-slate-400" />
                 <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">中文翻译 (仅供参考)</span>
               </div>
               <p className="text-slate-600 whitespace-pre-line leading-relaxed text-sm">{data.facebook.contentCn}</p>
            </div>

            <VisualSection visual={data.facebook.visual} />
          </div>
        );
      case 'tiktok':
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900 text-white p-5 rounded-lg shadow-lg">
               <div className="flex justify-between items-start mb-4 border-b border-slate-700 pb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-black bg-cyan-400 px-2 py-1 rounded">VIRAL SCRIPT (ENGLISH)</span>
                </div>
                <button 
                   onClick={() => handleCopy(`HOOK: ${data.tiktok.hookEn}\n\nSCRIPT:\n${data.tiktok.scriptEn}`)}
                  className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1 text-xs"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Copy Script
                </button>
              </div>
              
              <div className="mb-4">
                <h4 className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-1">The Hook (0-3s)</h4>
                <p className="text-xl font-bold italic">"{data.tiktok.hookEn}"</p>
              </div>

              <div>
                <h4 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Script Breakdown</h4>
                <div className="bg-slate-800/50 p-4 rounded text-slate-200 whitespace-pre-line font-mono text-sm leading-relaxed border-l-2 border-cyan-500">
                  {data.tiktok.scriptEn}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
               <div className="flex items-center gap-2 mb-3">
                 <Globe className="w-3 h-3 text-slate-400" />
                 <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">脚本中文翻译</span>
               </div>
               <div className="mb-3">
                 <span className="text-xs font-bold text-slate-400">HOOK:</span>
                 <p className="text-slate-700 font-medium">{data.tiktok.hookCn}</p>
               </div>
               <div>
                 <span className="text-xs font-bold text-slate-400">SCRIPT:</span>
                 <p className="text-slate-600 whitespace-pre-line text-sm mt-1">{data.tiktok.scriptCn}</p>
               </div>
            </div>

            {/* Custom Header for TikTok Visual (Cover/Thumbnail) */}
            <div className="mt-8 border-t border-slate-200 pt-6 animate-fadeIn">
               <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <Palette className="w-4 h-4 text-purple-600" />
                 封面指南 (Cover/Thumbnail Direction)
               </h3>
               
               <div className="grid gap-4 md:grid-cols-1">
                  <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                     <div className="flex items-center gap-2 mb-2">
                       <ImageIcon className="w-3 h-3 text-purple-500" />
                       <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">封面拍摄建议</span>
                     </div>
                     <p className="text-slate-700 text-sm leading-relaxed">{data.tiktok.visual.adviceCn}</p>
                  </div>

                  <div className="relative group">
                    <div className="absolute top-2 right-2 z-10">
                       <button 
                         onClick={() => handleCopyPrompt(data.tiktok.visual.promptEn)}
                         className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors shadow-sm"
                       >
                         {promptCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                         {promptCopied ? "Copied" : "Copy Prompt"}
                       </button>
                    </div>
                    <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto border border-slate-700 shadow-inner">
                       <span className="text-purple-400 select-none mr-2 font-bold uppercase tracking-wider text-[10px]">PROMPT:</span>
                       <span className="text-slate-100">{data.tiktok.visual.promptEn}</span>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
         <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            Part 2: 社媒矩阵内容 (Social Media Matrix)
         </h2>
      </div>
      
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('linkedin')}
          className={`flex-1 min-w-[100px] py-4 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'linkedin' 
              ? 'text-blue-700 border-b-2 border-blue-700 bg-blue-50/50' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Linkedin className="w-4 h-4" />
          LinkedIn
        </button>
        <button
          onClick={() => setActiveTab('instagram')}
          className={`flex-1 min-w-[100px] py-4 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'instagram' 
              ? 'text-pink-600 border-b-2 border-pink-600 bg-pink-50/50' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Instagram className="w-4 h-4" />
          Instagram
        </button>
        <button
          onClick={() => setActiveTab('facebook')}
          className={`flex-1 min-w-[100px] py-4 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'facebook' 
              ? 'text-blue-800 border-b-2 border-blue-800 bg-blue-100/50' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Facebook className="w-4 h-4" />
          Facebook
        </button>
        <button
          onClick={() => setActiveTab('tiktok')}
          className={`flex-1 min-w-[100px] py-4 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            activeTab === 'tiktok' 
              ? 'text-black border-b-2 border-black bg-slate-100' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Video className="w-4 h-4" />
          TikTok
        </button>
      </div>

      <div className="p-6 min-h-[400px]">
        {renderContent()}
      </div>
    </div>
  );
};

export default SocialMediaCard;