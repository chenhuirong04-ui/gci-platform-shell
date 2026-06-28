
import React, { useMemo, useState } from 'react';
import { ABMResponseData, ABMClient } from '../types';
import { Download, User, Archive, Package, ArrowUpDown, ExternalLink, UserPlus, Clock } from 'lucide-react';

interface ABMTableProps {
  data: ABMResponseData;
  onLoadMore?: () => void;
  isLoading?: boolean;
  onViewArchive?: () => void;
  onAddToQueue?: (client: ABMClient) => void; 
  onArchiveExplicitly?: (client: ABMClient) => void;
  hideLoadMore?: boolean;
}

const ABMTable: React.FC<ABMTableProps> = ({ data, onLoadMore, isLoading, onViewArchive, onAddToQueue, onArchiveExplicitly, hideLoadMore }) => {
  const [sortKey, setSortKey] = useState<'grade' | 'product'>('grade');

  const sortedClients = useMemo(() => {
    const gradeMap = { 'A': 0, 'B': 1, 'C': 2 };
    return [...data.clients].sort((a, b) => {
      if (sortKey === 'grade') {
        return gradeMap[a.grade] - gradeMap[b.grade];
      } else {
        return (a.product || '').localeCompare(b.product || '');
      }
    });
  }, [data.clients, sortKey]);

  return (
    <div className="animate-fadeIn space-y-4">
      <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-5 font-bold text-slate-500 uppercase text-[10px] cursor-pointer" onClick={() => setSortKey('grade')}>
                  优先级等级 <ArrowUpDown className="w-3 h-3 inline ml-1" />
                </th>
                <th className="px-6 py-5 font-bold text-slate-500 uppercase text-[10px]">客户名称 / 来源 ID</th>
                <th className="px-6 py-5 font-bold text-slate-500 uppercase text-[10px] cursor-pointer" onClick={() => setSortKey('product')}>
                  感兴趣产品 <ArrowUpDown className="w-3 h-3 inline ml-1" />
                </th>
                <th className="px-6 py-5 font-bold text-slate-500 uppercase text-[10px]">联系方式 (WhatsApp/Email)</th>
                <th className="px-6 py-5 font-bold text-slate-500 uppercase text-[10px] text-right">管理操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedClients.map((client, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/10 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${
                      client.grade === 'A' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      client.grade === 'B' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                      'bg-red-50 text-red-600 border-red-100'
                    }`}>
                      {client.grade === 'A' ? 'A级重点' : client.grade === 'B' ? 'B级潜力' : 'C级待定'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 flex items-center gap-2">
                        <User className="w-3 h-3 text-slate-400" /> {client.clientName}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono mt-1 flex items-center gap-1">
                        <Clock className="w-2 h-2" /> 主库 ID: {client.masterId || '未知'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
                      <Package className="w-3 h-3" /> {client.product || '未提取'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-xs italic truncate max-w-[150px]">{client.contact || '暂无'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                       {onAddToQueue && (
                          <button 
                            onClick={() => onAddToQueue(client)}
                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg border border-indigo-200 text-[10px] font-bold uppercase transition-all flex items-center gap-1 shadow-sm"
                          >
                             <UserPlus className="w-3 h-3" /> 跟进
                          </button>
                       )}
                       {onArchiveExplicitly && (
                          <button 
                            onClick={() => onArchiveExplicitly(client)}
                            className="bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white px-3 py-1.5 rounded-lg border border-orange-200 text-[10px] font-bold uppercase transition-all flex items-center gap-1 shadow-sm"
                          >
                             <Archive className="w-3 h-3" /> 归档
                          </button>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ABMTable;
