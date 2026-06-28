
import React, { useMemo } from 'react';
import { FollowUpLead } from '../types';
import { Bell, Zap, Calendar, ArrowRight, Clock } from 'lucide-react';

interface ReminderBlockProps {
  queue: FollowUpLead[];
  onAction: (lead: FollowUpLead) => void;
}

const ReminderBlock: React.FC<ReminderBlockProps> = ({ queue, onAction }) => {
  const reminders = useMemo(() => {
    const now = new Date();
    // 只提醒非暂停、非归档 且 nextFollowupAt <= now 的任务
    return queue.filter(l => 
      l.status !== 'PAUSED' && 
      l.status !== 'ARCHIVED' && 
      new Date(l.nextFollowupAt) <= now
    ).sort((a, b) => new Date(a.nextFollowupAt).getTime() - new Date(b.nextFollowupAt).getTime());
  }, [queue]);

  if (reminders.length === 0) return null;

  return (
    <div className="bg-indigo-600 rounded-[40px] p-8 text-white shadow-2xl shadow-indigo-200 animate-fadeIn overflow-hidden relative border-4 border-white/10">
      <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transform translate-x-1/4 -translate-y-1/4"><Bell className="w-64 h-64" /></div>
      
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-xl border border-white/20"><Bell className="w-7 h-7 text-white" /></div>
          <div>
             <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
               今日必达任务 ({reminders.length})
             </h2>
             <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em]">Immediate Action Required</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 bg-black/20 px-4 py-2 rounded-full border border-white/10">
           <Clock className="w-3 h-3 text-indigo-200" />
           <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">系统排期自动触发</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10">
        {reminders.map(lead => (
          <div key={lead.id} className="bg-white/10 hover:bg-white/20 backdrop-blur-2xl border border-white/10 p-5 rounded-[32px] flex items-center justify-between transition-all group cursor-pointer shadow-lg" onClick={() => onAction(lead)}>
             <div className="flex flex-col">
                <span className="font-black text-base group-hover:text-indigo-200 transition-colors">{lead.name}</span>
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mt-0.5">{lead.productInterest}</span>
                <div className="flex items-center gap-1.5 text-[9px] mt-2.5 text-indigo-200/80 font-bold bg-indigo-900/40 px-2 py-1 rounded-lg w-fit">
                   <Zap className="w-2 h-2" /> 建议: 立即发送跟进建议
                </div>
             </div>
             <button 
               className="bg-white text-indigo-600 p-3 rounded-2xl shadow-xl transform group-hover:scale-110 active:scale-95 transition-all group-hover:bg-indigo-50"
             >
                <ArrowRight className="w-6 h-6" />
             </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReminderBlock;
