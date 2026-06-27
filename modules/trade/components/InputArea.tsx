import React, { useState } from 'react';
import { Send, Eraser, MessageSquare } from 'lucide-react';

interface InputAreaProps {
  onGenerate: (text: string) => void;
  isLoading: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({ onGenerate, isLoading }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onGenerate(text);
    }
  };

  const handleClear = () => {
    setText('');
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-brand-600" />
          Negotiation / Chat Log
        </h2>
        <button 
          onClick={handleClear}
          className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors"
          type="button"
        >
          <Eraser className="w-3 h-3" />
          Clear
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4">
        <textarea
          className="flex-1 w-full p-3 text-sm text-gray-700 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none transition-all outline-none font-mono"
          placeholder="在此粘贴聊天记录... 例如：&#10;客户: 订购 200 个 iCare Pro。&#10;我: 单价 $50。另外有一笔 $30 的样品快递费支出需要记录。&#10;客户: 好的，定金 30%。"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isLoading}
        />
        
        <div className="mt-4">
          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            className={`w-full py-2.5 px-4 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all shadow-md
              ${isLoading || !text.trim() 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-brand-600 hover:bg-brand-700 hover:shadow-lg active:scale-[0.98]'
              }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                生成 PI 数据 (Processing...)
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                提取报价 & 生成 PI
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputArea;
