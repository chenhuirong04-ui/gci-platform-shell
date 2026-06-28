import React, { useState, useEffect } from 'react';
import { InternalTask, InternalTaskStatus, InternalTaskCategory } from '../types';
import { PersistenceService } from '../services/persistenceService';
import { translations } from '../services/i18n';
import {
  Plus, Calendar, User, CheckCircle2, Clock, Hourglass, X, LayoutGrid, Zap, AlignLeft
} from 'lucide-react';

const INTERNAL_TASKS_KEY = "ICARE_INTERNAL_TASKS_V1";

interface InternalTasksViewProps {
  lang: 'zh' | 'en';
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const InternalTasksView: React.FC<InternalTasksViewProps> = ({ onShowToast }) => {
  const t = translations['zh'];
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<InternalTask | null>(null);

  const initialTaskState = {
    title: '',
    category: '销售' as InternalTaskCategory,
    owner: '本人',
    dueDate: new Date().toISOString().slice(0, 10),
    status: '待处理' as InternalTaskStatus,
    description: ''
  };
  const [newTask, setNewTask] = useState(initialTaskState);

  // ✅ 关键修复 1：load 结果必须是数组，否则置空数组（避免 iPad 上 null 导致 .filter/.map 崩）
  useEffect(() => {
    PersistenceService.load(INTERNAL_TASKS_KEY).then((data) => {
      setTasks(Array.isArray(data) ? data : []);
    });
  }, []);

  // ✅ 关键修复 2：不再用 tasks.length > 0 才保存（否则跨设备永远不同步/空数据不写回）
  useEffect(() => {
    PersistenceService.save(INTERNAL_TASKS_KEY, tasks);
  }, [tasks]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    const task: InternalTask = {
      id: `INT_${Date.now()}`, ...newTask, logs: [], createdAt: new Date().toISOString()
    };
    setTasks(prev => [task, ...prev]);
    setNewTask(initialTaskState);
    setShowAddModal(false);
    if (onShowToast) onShowToast('事项已录入', 'success');
  };

  const handleUpdateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.title.trim()) return;
    setTasks(prev => prev.map(t => t.id === editingTask.id ? editingTask : t));
    setEditingTask(null);
    if (onShowToast) onShowToast('事项已更新', 'success');
  };

  const statusCols: InternalTaskStatus[] = ["待处理", "进行中", "等待他人", "已完成"];

  const getStatusIcon = (s: InternalTaskStatus) => {
    switch (s) {
      case "待处理": return <Clock className="w-4 h-4 text-slate-400" />;
      case "进行中": return <Zap className="w-4 h-4 text-indigo-500" />;
      case "等待他人": return <Hourglass className="w-4 h-4 text-amber-500" />;
      case "已完成": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><LayoutGrid className="w-5 h-5" /></div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">内部事项看板</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> 新增待办
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-[calc(100vh-280px)] overflow-hidden">
        {statusCols.map(status => {
          const colTasks = (tasks || []).filter(t => t.status === status);
          return (
            <div key={status} className="flex flex-col gap-4 h-full overflow-hidden">
              <div className="bg-white px-5 py-4 rounded-[24px] border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {getStatusIcon(status)}
                  <span className="text-xs font-black uppercase tracking-widest text-slate-600">{status}</span>
                </div>
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[10px] font-black">{colTasks.length}</span>
              </div>

              <div className="flex-grow overflow-y-auto space-y-4 pb-12 pr-1 custom-scrollbar">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => setEditingTask({ ...task })}
                    className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer animate-slideIn group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-black uppercase">{task.category}</span>
                      {task.description && <AlignLeft className="w-3 h-3 text-slate-300" />}
                    </div>

                    <h3 className="text-sm font-black text-slate-800 mb-4 line-clamp-2 leading-tight">{task.title}</h3>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        <Calendar className="w-3 h-3" />{task.dueDate}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-500 uppercase">
                        <User className="w-3 h-3" />{task.owner}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <form onSubmit={handleCreateTask} className="relative bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl space-y-6">
            <h2 className="text-xl font-black text-slate-800 uppercase">创建事项</h2>

            <input
              required
              type="text"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="事项标题"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="grid grid-cols-2 gap-4">
              <select
                value={newTask.category}
                onChange={e => setNewTask({ ...newTask, category: e.target.value as any })}
                className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-xs font-bold outline-none"
              >
                <option value="销售">销售</option>
                <option value="财务">财务</option>
                <option value="采购">采购</option>
                <option value="行政">行政</option>
                <option value="系统">系统</option>
              </select>

              <select
                value={newTask.status}
                onChange={e => setNewTask({ ...newTask, status: e.target.value as any })}
                className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-xs font-bold outline-none"
              >
                <option value="待处理">待处理</option>
                <option value="进行中">进行中</option>
                <option value="等待他人">等待他人</option>
                <option value="已完成">已完成</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={newTask.owner}
                  onChange={e => setNewTask({ ...newTask, owner: e.target.value })}
                  placeholder="负责人"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-4 text-xs font-bold outline-none"
                />
              </div>

              <input
                type="date"
                value={newTask.dueDate}
                onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-xs font-bold outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-5 rounded-[24px] font-black text-sm uppercase shadow-xl hover:bg-indigo-700 transition-all"
            >
              确认添加
            </button>
          </form>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingTask(null)} />
          <form onSubmit={handleUpdateTask} className="relative bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-800 uppercase">编辑事项</h2>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <input
              required
              type="text"
              value={editingTask.title}
              onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
              placeholder="事项标题"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <textarea
              value={editingTask.description || ''}
              onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
              placeholder="添加备注或详情描述..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none h-24 resize-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">所属分类</label>
                <select
                  value={editingTask.category}
                  onChange={e => setEditingTask({ ...editingTask, category: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-xs font-bold outline-none"
                >
                  <option value="销售">销售</option>
                  <option value="财务">财务</option>
                  <option value="采购">采购</option>
                  <option value="行政">行政</option>
                  <option value="系统">系统</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-2">事项状态</label>
                <select
                  value={editingTask.status}
                  onChange={e => setEditingTask({ ...editingTask, status: e.target.value as any })}
                  className="w-full bg-white border-2 border-indigo-100 rounded-2xl px-4 py-3.5 text-xs font-black text-indigo-600 outline-none shadow-sm"
                >
                  <option value="待处理">待处理</option>
                  <option value="进行中">进行中</option>
                  <option value="等待他人">等待他人</option>
                  <option value="已完成">已完成</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">执行人</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={editingTask.owner}
                    onChange={e => setEditingTask({ ...editingTask, owner: e.target.value })}
                    placeholder="负责人"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">截止日期</label>
                <input
                  type="date"
                  value={editingTask.dueDate}
                  onChange={e => setEditingTask({ ...editingTask, dueDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-xs font-bold outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black text-sm uppercase shadow-xl hover:bg-black transition-all"
            >
              保存更改
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default InternalTasksView;
