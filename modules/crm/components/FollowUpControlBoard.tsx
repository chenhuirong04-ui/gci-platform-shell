
import React, { useMemo } from 'react';
import { FollowUpLead } from '../types';
import { 
  Users, 
  PauseCircle, 
  Zap,
  TrendingUp,
  ShieldAlert,
  Clock,
  Hourglass
} from 'lucide-react';

interface FollowUpControlBoardProps {
  queue: FollowUpLead[];
}

const FollowUpControlBoard: React.FC<FollowUpControlBoardProps> = ({ queue }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const todo = queue.filter(l => l.status === 'TODO' || (l.status !== 'PAUSED' && new Date(l.nextFollowupAt) <= now)).length;
    const waiting = queue.filter(l => l.status === 'WAITING').length;
    const paused = queue.filter(l => l.status === 'PAUSED').length;
    
    let overdueCount = 0;
    queue.forEach(lead => {
      if (lead.status !== 'PAUSED' && new Date(lead.nextFollowupAt) < now) overdueCount++;
    });

    return { todo, waiting, paused, overdueCount, total: queue.length };
  }, [queue]);

  const kpis = [
    { title: '待办任务', value: stats.todo, icon: Zap, bg: 'bg-indigo-50', text: 'text-indigo-600' },
    { title: '等待客户回复', value: stats.waiting, icon: Hourglass, bg: 'bg-emerald-50', text: 'text-emerald-600' },
    { title: '严重逾期', value: stats.overdueCount, icon: Clock, bg: 'bg-red-50', text: 'text-red-600' },
    { title: '老板督办中', value: queue.filter(l => l.escalation).length, icon: ShieldAlert, bg: 'bg-orange-50', text: 'text-orange-600' },
    { title: '活跃总量', value: stats.total, icon: Users, bg: 'bg-blue-50', text: 'text-blue-600' },
    { title: '已暂停', value: stats.paused, icon: PauseCircle, bg: 'bg-slate-50', text: 'text-slate-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-fadeIn">
      {kpis.map((kpi, idx) => (
        <div key={idx} className={`${kpi.bg} p-5 rounded-3xl border border-white shadow-sm flex flex-col gap-2`}>
           <div className="flex items-center justify-between">
              <kpi.icon className={`w-5 h-5 ${kpi.text}`} />
              <span className={`text-2xl font-black ${kpi.text}`}>{kpi.value}</span>
           </div>
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{kpi.title}</span>
        </div>
      ))}
    </div>
  );
};

export default FollowUpControlBoard;
