import React, { useState, useEffect } from 'react';
import { useI18n } from '@gci/i18n';
import { useAuth } from '../../../apps/shell/src/contexts/AuthContext';
import {
  getExecutiveTasks, createExecutiveTask, updateExecutiveTask,
  internalTaskColumn, internalColumnToFields, dueAtToDateInput, dateInputToDueAt,
  ALL_BUSINESS_AREAS, BUSINESS_AREA_LABEL, BUSINESS_AREA_LABEL_ZH,
  type ExecutiveTask, type InternalTaskColumn, type TaskBusinessArea,
} from '../../../apps/shell/src/lib/executiveTasks';
import {
  Plus, Calendar, User, CheckCircle2, Clock, Hourglass, X, LayoutGrid, Zap, AlignLeft
} from 'lucide-react';

const GOLD   = '#B8960C';
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';

interface InternalTasksViewProps {
  lang: 'zh' | 'en';
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// The board's four columns. They are DERIVED from executive_tasks (status + blocker) — there is no separate
// "waiting" status: waiting = in_progress with a blocker text (see internalTaskColumn in executiveTasks.ts).
const COLUMNS: InternalTaskColumn[] = ['pending', 'in_progress', 'waiting', 'done'];

interface TaskForm {
  title: string;
  description: string;
  area: TaskBusinessArea;
  column: InternalTaskColumn;
  owner: string;
  dueDate: string;
  blocker: string;
}

const InternalTasksView: React.FC<InternalTasksViewProps> = ({ lang, onShowToast }) => {
  const { dict } = useI18n();
  const { profile } = useAuth();
  const t = dict.crm.internalTasks;
  const COLUMN_LABEL: Record<InternalTaskColumn, string> = {
    pending:     t.statusPending,
    in_progress: t.statusInProgress,
    waiting:     t.statusWaiting,
    done:        t.statusCompleted,
  };
  const areaLabel = (a: TaskBusinessArea) => (lang === 'zh' ? BUSINESS_AREA_LABEL_ZH : BUSINESS_AREA_LABEL)[a] ?? a;

  const [tasks, setTasks] = useState<ExecutiveTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<{ original: ExecutiveTask; form: TaskForm } | null>(null);

  const initialForm = (): TaskForm => ({
    title: '',
    description: '',
    area: 'OTHER',
    column: 'pending',
    owner: profile?.display_name ?? '',
    dueDate: new Date().toISOString().slice(0, 10),
    blocker: '',
  });
  const [newTask, setNewTask] = useState<TaskForm>(initialForm);

  const load = async () => {
    const res = await getExecutiveTasks();
    if (res.ok) { setTasks(res.rows); setLoadError(null); } else { setLoadError(res.error); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const toast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => { if (onShowToast) onShowToast(msg, type); };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !newTask.title.trim()) return;
    if (newTask.column === 'waiting' && !newTask.blocker.trim()) { toast(t.blockerPlaceholder, 'error'); return; }
    setSaving(true);
    const f = internalColumnToFields(newTask.column, newTask.blocker);
    const res = await createExecutiveTask({
      title: newTask.title.trim(),
      description: newTask.description.trim() || null,
      businessArea: newTask.area,
      dueAt: dateInputToDueAt(newTask.dueDate),
      status: f.status,
      owner: newTask.owner.trim() || null,
      blocker: f.blocker,
      source: 'crm_internal_tasks',
    });
    setSaving(false);
    if (!res.ok) { toast(`${t.saveFailed}: ${res.error}`, 'error'); return; }
    setTasks(prev => [res.task, ...prev]);
    setNewTask(initialForm());
    setShowAddModal(false);
    toast(t.taskCreatedToast, 'success');
  };

  const openEdit = (task: ExecutiveTask) => setEditingTask({
    original: task,
    form: {
      title: task.title,
      description: task.description ?? '',
      area: task.business_area,
      column: internalTaskColumn(task),
      owner: task.owner ?? '',
      dueDate: dueAtToDateInput(task.due_at),
      blocker: task.blocker ?? '',
    },
  });

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !editingTask || !editingTask.form.title.trim()) return;
    const { original, form } = editingTask;
    if (form.column === 'waiting' && !form.blocker.trim()) { toast(t.blockerPlaceholder, 'error'); return; }

    // Only CHANGED fields are written. In particular status is not re-sent for an unchanged column, so editing the
    // title of an already-completed task never stamps a fresh completed_at on it.
    const patch: Parameters<typeof updateExecutiveTask>[1] = {};
    if (form.title.trim() !== original.title) patch.title = form.title.trim();
    if (form.description.trim() !== (original.description ?? '').trim()) patch.description = form.description.trim() || null;
    if (form.area !== original.business_area) patch.businessArea = form.area;
    if ((form.owner.trim() || null) !== ((original.owner ?? '').trim() || null)) patch.owner = form.owner.trim() || null;
    if (form.dueDate !== dueAtToDateInput(original.due_at)) patch.dueAt = dateInputToDueAt(form.dueDate);
    const origColumn = internalTaskColumn(original);
    if (form.column !== origColumn || (form.column === 'waiting' && form.blocker.trim() !== (original.blocker ?? '').trim())) {
      const f = internalColumnToFields(form.column, form.blocker);
      if (f.status !== original.status) patch.status = f.status;
      if ((f.blocker ?? null) !== ((original.blocker ?? '').trim() || null)) patch.blocker = f.blocker;
    }

    if (Object.keys(patch).length === 0) { setEditingTask(null); return; }
    setSaving(true);
    const res = await updateExecutiveTask(original.id, patch);
    setSaving(false);
    if (!res.ok) { toast(`${t.saveFailed}: ${res.error}`, 'error'); return; }
    setEditingTask(null);
    await load();
    toast(t.taskUpdatedToast, 'success');
  };

  const getStatusIcon = (c: InternalTaskColumn) => {
    switch (c) {
      case 'pending': return <Clock className="w-4 h-4 text-slate-400" />;
      case 'in_progress': return <Zap className="w-4 h-4 text-indigo-500" />;
      case 'waiting': return <Hourglass className="w-4 h-4 text-amber-500" />;
      case 'done': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    }
  };

  const selectStyle = { background: CARD2, border: `1px solid ${BORDER}`, color: T1 };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl text-white shadow-lg" style={{ backgroundColor: GOLD }}><LayoutGrid className="w-5 h-5" /></div>
          <h2 className="text-xl font-black uppercase tracking-tight" style={{ color: T1 }}>{t.pageTitle}</h2>
        </div>
        <button
          onClick={() => { setNewTask(initialForm()); setShowAddModal(true); }}
          className="text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-xl flex items-center gap-2 transition-all active:scale-95 hover:opacity-90"
          style={{ backgroundColor: GOLD }}
        >
          <Plus className="w-4 h-4" /> {t.addTask}
        </button>
      </div>

      {loading && <div className="text-xs font-bold" style={{ color: T2 }}>{t.loadingTasks}</div>}
      {loadError && <div className="text-xs font-bold" style={{ color: '#FCA5A5' }}>{t.loadFailed}: {loadError}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-[calc(100vh-280px)] overflow-hidden">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(x => internalTaskColumn(x) === col);
          return (
            <div key={col} className="flex flex-col gap-4 h-full overflow-hidden">
              <div className="px-5 py-4 rounded-[24px] flex items-center justify-between shrink-0" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2">
                  {getStatusIcon(col)}
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: T1 }}>{COLUMN_LABEL[col]}</span>
                </div>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.07)', color: T2 }}>{colTasks.length}</span>
              </div>

              <div className="flex-grow overflow-y-auto space-y-4 pb-12 pr-1 custom-scrollbar">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => openEdit(task)}
                    className="p-5 rounded-[28px] transition-all cursor-pointer animate-slideIn group"
                    style={{ background: CARD2, border: `1px solid ${BORDER}` }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = `${GOLD}60`)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase" style={{ background: 'rgba(255,255,255,0.07)', color: T2 }}>{areaLabel(task.business_area)}</span>
                      {task.description && <AlignLeft className="w-3 h-3" style={{ color: T2 }} />}
                    </div>

                    <h3 className="text-sm font-black mb-4 line-clamp-2 leading-tight" style={{ color: T1 }}>{task.title}</h3>
                    {col === 'waiting' && task.blocker && (
                      <p className="text-[10px] font-bold mb-3 line-clamp-2" style={{ color: '#F59E0B' }}>{task.blocker}</p>
                    )}

                    <div className="flex items-center justify-between pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: T2 }}>
                        <Calendar className="w-3 h-3" />{dueAtToDateInput(task.due_at) || '—'}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase" style={{ color: GOLD }}>
                        <User className="w-3 h-3" />{task.owner || '—'}
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
          <form onSubmit={handleCreateTask} className="relative rounded-[40px] p-8 w-full max-w-md shadow-2xl space-y-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <h2 className="text-xl font-black uppercase" style={{ color: T1 }}>{t.createTaskTitle}</h2>

            <input
              required
              type="text"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              placeholder={t.taskTitlePlaceholder}
              className="w-full rounded-2xl px-5 py-4 text-sm font-bold outline-none"
              style={selectStyle}
            />

            <div className="grid grid-cols-2 gap-4">
              <select
                value={newTask.area}
                onChange={e => setNewTask({ ...newTask, area: e.target.value as TaskBusinessArea })}
                className="rounded-2xl px-4 py-4 text-xs font-bold outline-none"
                style={selectStyle}
              >
                {ALL_BUSINESS_AREAS.map(a => <option key={a} value={a}>{areaLabel(a)}</option>)}
              </select>

              <select
                value={newTask.column}
                onChange={e => setNewTask({ ...newTask, column: e.target.value as InternalTaskColumn })}
                className="rounded-2xl px-4 py-4 text-xs font-bold outline-none"
                style={selectStyle}
              >
                {COLUMNS.map(c => <option key={c} value={c}>{COLUMN_LABEL[c]}</option>)}
              </select>
            </div>

            {newTask.column === 'waiting' && (
              <input
                required
                type="text"
                value={newTask.blocker}
                onChange={e => setNewTask({ ...newTask, blocker: e.target.value })}
                placeholder={t.blockerPlaceholder}
                className="w-full rounded-2xl px-5 py-4 text-xs font-bold outline-none"
                style={selectStyle}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: T2 }} />
                <input
                  type="text"
                  value={newTask.owner}
                  onChange={e => setNewTask({ ...newTask, owner: e.target.value })}
                  placeholder={t.ownerPlaceholder}
                  className="w-full rounded-2xl pl-10 pr-4 py-4 text-xs font-bold outline-none"
                  style={selectStyle}
                />
              </div>

              <input
                type="date"
                value={newTask.dueDate}
                onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="w-full rounded-2xl px-4 py-4 text-xs font-bold outline-none"
                style={selectStyle}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full text-white py-5 rounded-[24px] font-black text-sm uppercase shadow-xl hover:opacity-90 transition-all disabled:opacity-60"
              style={{ backgroundColor: GOLD }}
            >
              {t.confirmAdd}
            </button>
          </form>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingTask(null)} />
          <form onSubmit={handleUpdateTask} className="relative rounded-[40px] p-8 w-full max-w-md shadow-2xl space-y-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black uppercase" style={{ color: T1 }}>{t.editTaskTitle}</h2>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="p-2 rounded-full transition-colors"
                style={{ color: T2 }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              required
              type="text"
              value={editingTask.form.title}
              onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, title: e.target.value } })}
              placeholder={t.taskTitlePlaceholder}
              className="w-full rounded-2xl px-5 py-4 text-sm font-bold outline-none"
              style={selectStyle}
            />

            <textarea
              value={editingTask.form.description}
              onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, description: e.target.value } })}
              placeholder={t.notePlaceholder}
              className="w-full rounded-2xl px-5 py-4 text-sm font-bold outline-none h-24 resize-none"
              style={selectStyle}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest ml-2" style={{ color: T2 }}>{t.categoryFieldLabel}</label>
                <select
                  value={editingTask.form.area}
                  onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, area: e.target.value as TaskBusinessArea } })}
                  className="w-full rounded-2xl px-4 py-3.5 text-xs font-bold outline-none"
                  style={selectStyle}
                >
                  {ALL_BUSINESS_AREAS.map(a => <option key={a} value={a}>{areaLabel(a)}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest ml-2" style={{ color: GOLD }}>{t.statusFieldLabel}</label>
                <select
                  value={editingTask.form.column}
                  onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, column: e.target.value as InternalTaskColumn } })}
                  className="w-full rounded-2xl px-4 py-3.5 text-xs font-black outline-none"
                  style={{ background: CARD2, border: `1px solid ${GOLD}40`, color: GOLD }}
                >
                  {COLUMNS.map(c => <option key={c} value={c}>{COLUMN_LABEL[c]}</option>)}
                </select>
              </div>
            </div>

            {editingTask.form.column === 'waiting' && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest ml-2" style={{ color: T2 }}>{t.blockerFieldLabel}</label>
                <input
                  required
                  type="text"
                  value={editingTask.form.blocker}
                  onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, blocker: e.target.value } })}
                  placeholder={t.blockerPlaceholder}
                  className="w-full rounded-2xl px-5 py-3.5 text-xs font-bold outline-none"
                  style={selectStyle}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest ml-2" style={{ color: T2 }}>{t.ownerFieldLabel}</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: T2 }} />
                  <input
                    type="text"
                    value={editingTask.form.owner}
                    onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, owner: e.target.value } })}
                    placeholder={t.ownerPlaceholder}
                    className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-xs font-bold outline-none"
                    style={selectStyle}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest ml-2" style={{ color: T2 }}>{t.dueDateFieldLabel}</label>
                <input
                  type="date"
                  value={editingTask.form.dueDate}
                  onChange={e => setEditingTask({ ...editingTask, form: { ...editingTask.form, dueDate: e.target.value } })}
                  className="w-full rounded-2xl px-4 py-3.5 text-xs font-bold outline-none"
                  style={selectStyle}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full text-white py-5 rounded-[24px] font-black text-sm uppercase shadow-xl hover:opacity-90 transition-all disabled:opacity-60"
              style={{ backgroundColor: GOLD }}
            >
              {t.saveChanges}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default InternalTasksView;
