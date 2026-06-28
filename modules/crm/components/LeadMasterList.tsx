
import React from 'react';
import { LeadMaster } from '../types';
import { X, Database, Clock, ChevronRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface LeadMasterListProps {
  leads: LeadMaster[];
  onSelect: (lead: LeadMaster) => void;
  onClose: () => void;
}

const LeadMasterList: React.FC<LeadMasterListProps> = ({ leads, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-slideLeft">
        <div className="p-6 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-slate-600" />
            <div>
              <h2 className="text-xl font-black text-slate-800">LeadMaster 数据库 (SOT)</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Historical Logs: {leads.length}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 italic">
               暂无数据记录
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <button 
                  key={lead.id}
                  onClick={() => onSelect(lead)}
                  className="w-full p-6 text-left hover:bg-indigo-50/30 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg mt-1 ${
                      lead.processingStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
                      lead.processingStatus === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {lead.processingStatus === 'COMPLETED' ? <CheckCircle2 className="w-5 h-5" /> :
                       lead.processingStatus === 'FAILED' ? <AlertCircle className="w-5 h-5" /> :
                       <Loader2 className="w-5 h-5 animate-spin" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-slate-400 font-black tracking-tight">{lead.id}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100">{lead.source}</span>
                      </div>
                      <h3 className="font-bold text-slate-800 leading-tight">
                        {lead.clientName || lead.rawInputText?.slice(0, 30) || 'Unnamed Entry'}
                      </h3>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase">
                          <Clock className="w-3 h-3" /> {new Date(lead.createdAt).toLocaleString()}
                        </span>
                        {lead.product && (
                          <span className="text-[10px] text-indigo-500 font-bold uppercase">📦 {lead.product}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadMasterList;
