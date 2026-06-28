
import React, { useState, useMemo } from 'react';
import { FollowUpTask, BusinessType, Project } from '../types';
import { Language, translations } from '../services/i18n';
import {
  Search, Globe, Clock, MessageSquare, Calendar, Download,
  Briefcase, ShoppingBag, FileSearch, X, Phone, Mail,
  ChevronRight, Edit2, Save, XCircle, PlusCircle, FileText, User, Tag,
  Archive, Trash2,
} from 'lucide-react';
import { exportToCSV } from '../services/exportService';
import { getTaskBusinessId, getProjectBusinessId, compareByBusinessId } from '../utils/businessId';
import { colors, statusMap, type StatusKey, Badge as DSBadge } from '@gci/design-system';

const GOLD = colors.goldBase;
const NAVY = colors.bgBase;

// Task/record lifecycle status -> centralized StatusKey (5 allowed colors).
const RECORD_STATUS_KEY: Record<string, StatusKey> = {
  todo: 'newInquiry',
  completed: 'confirmed',
  archived: 'paused',
  deleted: 'urgent',
  '进行中': 'newInquiry',
  '已完成': 'confirmed',
  '暂停': 'urgent',
};

interface HistoryViewProps {
  tasks: FollowUpTask[];
  projects: Project[];
  lang: Language;
  onUpdateTask: (task: FollowUpTask) => void;
  onArchiveTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}

const OWNERS   = ['Chris', 'lili', 'novie'];
const BIZ_TYPES: BusinessType[] = ['TRADE', 'PROJECT', 'LOG_ONLY'];
const BIZ_LABELS: Record<BusinessType, string> = { TRADE: '贸易询盘', PROJECT: '项目推进', LOG_ONLY: '仅记录' };
const STATUSES = ['todo', 'archived', 'completed'];
const STATUS_LABELS: Record<string, string> = { todo: '跟进中', archived: '已归档', completed: '已完成', deleted: '已删除' };
const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];

// ── 统一记录类型（仅用于视图渲染，不存储）──────────────────────
type URecord = {
  key: string;
  bizId: string;        // 业务 ID，用于显示和排序
  rawId: string;        // 原始 ID，用于 compareByBusinessId
  source: 'task' | 'project' | 'merged';
  clientName: string;
  countryCity: string;
  bizTypeLabel: string;
  bizType: BusinessType | string;
  tradeStatus: string;
  displayStatus: string;
  lastContent: string;
  inquirySummary: string;
  categories: string;
  nextFollowUpAt: string;
  sortTime: string;
  owner: string;
  task?: FollowUpTask;
  project?: Project;
};

const HistoryView: React.FC<HistoryViewProps> = ({
  tasks, projects, lang, onUpdateTask, onArchiveTask, onDeleteTask,
}) => {
  const t = translations[lang];
  const [searchTerm,      setSearchTerm]      = useState('');
  const [statusFilter,    setStatusFilter]    = useState<'all' | 'todo' | 'completed' | 'archived' | 'deleted'>('all');
  const [typeFilter,      setTypeFilter]      = useState<'all' | BusinessType>('all');
  const [selectedTask,    setSelectedTask]    = useState<FollowUpTask | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const getStatusLabel = (s: string) => STATUS_LABELS[s] ?? s;
  const getTypeLabel   = (bt: BusinessType) => BIZ_LABELS[bt] ?? bt;

  // ── 统一记录合并 ─────────────────────────────────────────────
  //
  // 数据源规则（2026-05-20 更新）：
  //   主数据源：ICARE_HISTORY_V1 (tasks) ← Follow-up Log
  //   补充数据：ICARE_PROJECTS_V1 (projects) 只用于 enrich task 行（联系人、背景）
  //              旧手动 project 不再作为独立行出现，避免重复和状态过期
  //
  // 历史归档 = 全状态留底库，包括 暂缓/已归档/已成交/已取消
  const unifiedRecords = useMemo<URecord[]>(() => {
    const q = searchTerm.toLowerCase();

    // 给 task 匹配补充 project（仅用于 enrich 联系人/背景，不生成独立行）
    const findProject = (task: FollowUpTask): Project | undefined =>
      projects.find(p =>
        (p.contactKey && task.contactKey && p.contactKey === task.contactKey) ||
        (p.clientName && task.clientName &&
          p.clientName.toLowerCase() === task.clientName.toLowerCase())
      );

    // task 搜索匹配
    const taskMatchesSearch = (task: FollowUpTask, proj?: Project) =>
      !q ||
      task.clientName.toLowerCase().includes(q) ||
      (task.phoneE164  || '').includes(q) ||
      (task.whatsapp   || '').includes(q) ||
      (task.email      || '').toLowerCase().includes(q) ||
      (task.countryCity || '').toLowerCase().includes(q) ||
      (task.inquirySummary || '').toLowerCase().includes(q) ||
      (task.categories || '').toLowerCase().includes(q) ||
      (task.lastNote   || '').toLowerCase().includes(q) ||
      (task.lastContext || '').toLowerCase().includes(q) ||
      ((task as any).businessId || '').toLowerCase().includes(q) ||
      (proj?.name      || '').toLowerCase().includes(q) ||
      (proj?.projectFollowUps || []).some(f => f.content.toLowerCase().includes(q));

    // task 状态过滤（默认隐藏 deleted，需主动选择才显示）
    // 注意：历史归档不过滤 暂缓/已归档/已成交 —— 全部显示
    const taskMatchesStatus = (task: FollowUpTask) => {
      if (statusFilter !== 'deleted' && task.status === 'deleted') return false;
      if (statusFilter === 'all') return true;
      return task.status === statusFilter;
    };

    // task 类型过滤
    const taskMatchesType = (task: FollowUpTask) =>
      typeFilter === 'all' || task.businessType === typeFilter;

    // ── 主数据源：tasks（含所有 tradeStatus）──────────────────────────────
    // bizId 优先读 task.businessId（Notion 里的 2026-XXX），
    // 因为 getTaskBusinessId(NOTION-xxx) 返回空
    const taskRows: URecord[] = tasks
      .filter(task => {
        const proj = findProject(task);
        return taskMatchesSearch(task, proj) && taskMatchesStatus(task) && taskMatchesType(task);
      })
      .map(task => {
        const proj = findProject(task);
        const bizId = (task as any).businessId || getTaskBusinessId(task.id) || '';
        return {
          key:            task.id,
          bizId,
          rawId:          task.id,
          source:         proj ? 'merged' : 'task',
          clientName:     task.clientName,
          countryCity:    task.countryCity || proj?.countryCity || '',
          bizTypeLabel:   BIZ_LABELS[task.businessType] ?? task.businessType,
          bizType:        task.businessType,
          tradeStatus:    task.tradeStatus || proj?.tradeStatus || '',
          displayStatus:  task.status,
          lastContent:    task.lastNote || task.lastContext || proj?.projectFollowUps?.[0]?.content || '',
          inquirySummary: task.inquirySummary || task.goal || task.lastContext || proj?.initialContext || '',
          categories:     task.categories || '',
          nextFollowUpAt: task.nextFollowUpAt || proj?.nextActionAt || '',
          sortTime:       task.completedAt || task.updatedAt,
          owner:          task.owner || proj?.owner || '',
          task,
          project:        proj,
        };
      });

    // ── Part 2 已移除 ──────────────────────────────────────────────────────
    // 旧 ICARE_PROJECTS_V1 记录不再作为独立行：
    //   - 有同名 task → 已通过 findProject enrich 到 task 行里
    //   - businessId 为空的旧手动建档 → 数据来源不可信，不展示
    //   - 这样历史归档数量 = tasks 的去重业务数，不是 tasks + projects 相加

    // ── 按 businessId 数字升序，无编号的放最后 ────────────────────────────
    const bizNum = (bizId: string): number => {
      if (!bizId) return Infinity;
      const m = bizId.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : Infinity;
    };

    return taskRows.sort((a, b) => bizNum(a.bizId) - bizNum(b.bizId));
  }, [tasks, projects, searchTerm, statusFilter, typeFilter]);

  // CSV 导出只导出有 task 的行
  const taskRecordsForExport = useMemo(
    () => unifiedRecords.filter(r => r.task).map(r => r.task!),
    [unifiedRecords]
  );

  /* ─── 只读项目抽屉（project-only 行点击后打开）─────────────── */
  const ProjectDrawer = ({ project }: { project: Project }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={() => setSelectedProject(null)}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-8 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-black text-slate-800 truncate">{project.clientName}</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5 flex items-center gap-2 flex-wrap">
              <Globe className="w-3 h-3 shrink-0" />{project.countryCity || '—'}
              <DSBadge color={project.type === '项目型' ? colors.statusInfo : GOLD} bg={project.type === '项目型' ? 'rgba(143,166,212,0.16)' : `${GOLD}18`} label={project.type} className="ml-2 uppercase" />
            </p>
          </div>
          <button onClick={() => setSelectedProject(null)} className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-400 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            {project.whatsapp  && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{project.whatsapp}</span>}
            {project.phoneE164 && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{project.phoneE164}</span>}
            {project.email     && <span className="flex items-center gap-1 col-span-2"><Mail className="w-3 h-3" />{project.email}</span>}
          </div>

          <div className="flex gap-6 flex-wrap">
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">阶段</p><p className="text-sm font-black" style={{ color: GOLD }}>{project.tradeStatus}</p></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">状态</p><p className="text-sm font-black text-slate-700">{project.status}</p></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">负责人</p><p className="text-sm font-black text-slate-700">{project.owner || '—'}</p></div>
            {project.nextActionAt && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />下次跟进</p>
                <p className="text-sm font-black" style={{ color: GOLD }}>{new Date(project.nextActionAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" />项目背景</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{project.initialContext || '—'}</p>
          </div>

          {Array.isArray(project.projectFollowUps) && project.projectFollowUps.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <FileText className="w-3 h-3" /> 跟进记录 ({project.projectFollowUps.length})
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {project.projectFollowUps.map((f, i) => (
                  <div key={i} className="flex gap-3 text-xs border-l-2 border-slate-100 pl-3">
                    <span className="text-slate-300 font-bold shrink-0 w-[76px]">{f.time}</span>
                    <span className="text-slate-500 leading-relaxed">{f.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <p className="text-[10px] font-bold text-slate-400 text-center">此记录来自业务跟进中心 · 如需编辑请前往"业务跟进"页面</p>
        </div>
      </div>
    </div>
  );

  /* ─── 详情 + 编辑 + 追加 抽屉（任务专用）─────────────────── */
  const DetailDrawer = ({ task }: { task: FollowUpTask }) => {
    const [mode, setMode] = useState<'view' | 'edit' | 'append'>('view');

    const [draft, setDraft] = useState({
      clientName:     task.clientName   || '',
      whatsapp:       task.whatsapp     || '',
      phoneE164:      task.phoneE164    || '',
      email:          task.email        || '',
      inquirySummary: task.inquirySummary || task.lastContext || task.goal || '',
      lastNote:       task.lastNote     || task.lastContext || '',
      nextFollowUpAt: task.nextFollowUpAt ? task.nextFollowUpAt.slice(0, 10) : '',
      status:         task.status       || 'todo',
      businessType:   task.businessType || 'TRADE',
      owner:          task.owner        || 'Chris',
    });

    const [append, setAppend] = useState({
      method:         'WhatsApp',
      content:        '',
      nextAction:     '',
      nextFollowUpAt: '',
    });

    const handleSaveEdit = () => {
      const now = new Date().toISOString();
      const updated: FollowUpTask = {
        ...task,
        clientName:     draft.clientName,
        whatsapp:       draft.whatsapp,
        phoneE164:      draft.phoneE164,
        email:          draft.email,
        inquirySummary: draft.inquirySummary,
        lastNote:       draft.lastNote,
        nextFollowUpAt: draft.nextFollowUpAt || task.nextFollowUpAt,
        status:         draft.status as any,
        businessType:   draft.businessType as BusinessType,
        owner:          draft.owner,
        updatedAt:      now,
        history: [...(task.history || []), {
          id: `EDIT_${Date.now()}`,
          timestamp: now,
          type: 'CORRECTED' as const,
          message: `[人工编辑] 字段已更新`,
          payload: { manual: true },
        }],
      };
      onUpdateTask(updated);
      setSelectedTask(updated);
      setMode('view');
    };

    const handleSaveAppend = () => {
      if (!append.content.trim()) return;
      const now = new Date().toISOString();
      const newEntry: any = {
        id:        `MANUAL_${Date.now()}`,
        timestamp: now,
        type:      'CORRECTED',
        message:   append.content,
        summary:   append.content,
        source:    'manual',
        by:        task.owner || 'Chris',
        payload:   { method: append.method, nextAction: append.nextAction, manual: true },
      };
      const updated: FollowUpTask = {
        ...task,
        lastNote:       append.content,
        nextFollowUpAt: append.nextFollowUpAt || task.nextFollowUpAt,
        updatedAt:      now,
        history:        [...(task.history || []), newEntry],
      };
      onUpdateTask(updated);
      setSelectedTask(updated);
      setMode('view');
      setAppend({ method: 'WhatsApp', content: '', nextAction: '', nextFollowUpAt: '' });
    };

    const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 bg-slate-50';
    const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={() => setSelectedTask(null)}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div
          className="relative z-10 w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── 顶部 header ── */}
          <div className="flex items-start justify-between px-8 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              {mode === 'edit' ? (
                <input
                  className={inputCls + ' text-base font-black'}
                  value={draft.clientName}
                  onChange={e => setDraft(d => ({ ...d, clientName: e.target.value }))}
                />
              ) : (
                <h2 className="text-lg font-black text-slate-800 truncate">{task.clientName}</h2>
              )}
              <p className="text-xs text-slate-400 font-bold mt-0.5 flex items-center gap-2 flex-wrap">
                <Globe className="w-3 h-3 shrink-0" />{task.countryCity || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {mode === 'view' && (
                <button
                  onClick={() => setMode('edit')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[13px] font-black transition-colors"
                  style={{ backgroundColor: `${GOLD}18`, color: GOLD }}
                >
                  <Edit2 className="w-3 h-3" /> 编辑
                </button>
              )}
              {mode === 'edit' && (
                <>
                  <button onClick={handleSaveEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-[13px] font-black transition-colors hover:opacity-90" style={{ backgroundColor: colors.statusSuccess }}>
                    <Save className="w-3 h-3" /> 保存
                  </button>
                  <button onClick={() => setMode('view')} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 text-[13px] font-black transition-colors">
                    <XCircle className="w-3 h-3" /> 取消
                  </button>
                </>
              )}
              {mode === 'append' && (
                <>
                  <button onClick={handleSaveAppend} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-[13px] font-black transition-colors hover:opacity-90" style={{ backgroundColor: colors.statusSuccess }}>
                    <Save className="w-3 h-3" /> 确认追加
                  </button>
                  <button onClick={() => setMode('view')} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 text-[13px] font-black transition-colors">
                    <XCircle className="w-3 h-3" /> 取消
                  </button>
                </>
              )}
              <button onClick={() => setSelectedTask(null)} className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── 主体内容 ── */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

            {/* ── 编辑模式 ── */}
            {mode === 'edit' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={labelCls}><Phone className="w-3 h-3 inline mr-1" />电话</p>
                    <input className={inputCls} value={draft.phoneE164} onChange={e => setDraft(d => ({ ...d, phoneE164: e.target.value }))} placeholder="+971..." />
                  </div>
                  <div>
                    <p className={labelCls}><MessageSquare className="w-3 h-3 inline mr-1" />WhatsApp</p>
                    <input className={inputCls} value={draft.whatsapp} onChange={e => setDraft(d => ({ ...d, whatsapp: e.target.value }))} placeholder="+971..." />
                  </div>
                  <div className="col-span-2">
                    <p className={labelCls}><Mail className="w-3 h-3 inline mr-1" />邮箱</p>
                    <input className={inputCls} value={draft.email || ''} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="email@..." />
                  </div>
                </div>
                <div>
                  <p className={labelCls}>咨询内容摘要</p>
                  <textarea rows={3} className={inputCls} value={draft.inquirySummary} onChange={e => setDraft(d => ({ ...d, inquirySummary: e.target.value }))} />
                </div>
                <div>
                  <p className={labelCls}>最近跟进详情</p>
                  <textarea rows={3} className={inputCls} value={draft.lastNote} onChange={e => setDraft(d => ({ ...d, lastNote: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={labelCls}><Calendar className="w-3 h-3 inline mr-1" />下次跟进日期</p>
                    <input type="date" className={inputCls} value={draft.nextFollowUpAt} onChange={e => setDraft(d => ({ ...d, nextFollowUpAt: e.target.value }))} />
                  </div>
                  <div>
                    <p className={labelCls}><User className="w-3 h-3 inline mr-1" />负责人</p>
                    <select className={inputCls} value={draft.owner} onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}>
                      {OWNERS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}>状态</p>
                    <select className={inputCls} value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}>业务类型</p>
                    <select className={inputCls} value={draft.businessType} onChange={e => setDraft(d => ({ ...d, businessType: e.target.value as BusinessType }))}>
                      {BIZ_TYPES.map(b => <option key={b} value={b}>{BIZ_LABELS[b]}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── 追加跟进模式 ── */}
            {mode === 'append' && (
              <div className="space-y-4 rounded-2xl p-5 border" style={{ backgroundColor: `${GOLD}0F`, borderColor: `${GOLD}30` }}>
                <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1" style={{ color: GOLD }}>
                  <PlusCircle className="w-3.5 h-3.5" /> 追加跟进记录
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={labelCls}>跟进方式</p>
                    <select className={inputCls} value={append.method} onChange={e => setAppend(a => ({ ...a, method: e.target.value }))}>
                      {METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}><Calendar className="w-3 h-3 inline mr-1" />下次跟进日期</p>
                    <input type="date" className={inputCls} value={append.nextFollowUpAt} onChange={e => setAppend(a => ({ ...a, nextFollowUpAt: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <p className={labelCls}>跟进内容 *</p>
                  <textarea rows={4} className={inputCls} placeholder="本次跟进了什么？客户反馈如何？" value={append.content} onChange={e => setAppend(a => ({ ...a, content: e.target.value }))} />
                </div>
                <div>
                  <p className={labelCls}>下次行动</p>
                  <input className={inputCls} placeholder="例：发报价单、安排看样..." value={append.nextAction} onChange={e => setAppend(a => ({ ...a, nextAction: e.target.value }))} />
                </div>
              </div>
            )}

            {/* ── 查看模式 ── */}
            {mode === 'view' && (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  {(task.phoneE164 || (task as any).phone) && (
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{task.phoneE164 || (task as any).phone}</span>
                  )}
                  {(task.whatsapp) && (
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{task.whatsapp}</span>
                  )}
                  {task.email && (
                    <span className="flex items-center gap-1 col-span-2"><Mail className="w-3 h-3" />{task.email}</span>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> 咨询内容
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {task.inquirySummary || task.lastContext || task.goal || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 最近跟进详情
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed italic whitespace-pre-wrap">
                    {task.lastNote || task.lastContext || task.goal || '—'}
                  </p>
                </div>

                <div className="flex gap-6">
                  {task.nextFollowUpAt && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> 下次跟进
                      </p>
                      <p className="text-sm font-black" style={{ color: GOLD }}>
                        {new Date(task.nextFollowUpAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {task.owner && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <User className="w-3 h-3" /> 负责人
                      </p>
                      <p className="text-sm font-black text-slate-700">{task.owner}</p>
                    </div>
                  )}
                </div>

                {Array.isArray((task as any).history) && (task as any).history.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> 历史记录 ({(task as any).history.length})
                    </p>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {[...(task as any).history].reverse().map((h: any, i: number) => (
                        <div key={i} className="flex gap-3 text-xs border-l-2 border-slate-100 pl-3">
                          <span className="text-slate-300 font-bold shrink-0 w-[76px]">
                            {h.at
                              ? new Date(h.at).toLocaleDateString()
                              : h.timestamp
                              ? new Date(h.timestamp).toLocaleDateString()
                              : '—'}
                          </span>
                          <span className="text-slate-500 leading-relaxed">{h.summary || h.message || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 底部操作栏 ── */}
          {mode === 'view' && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={() => setMode('append')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-black transition-colors shadow-md hover:opacity-90"
                style={{ backgroundColor: NAVY }}
              >
                <PlusCircle className="w-3.5 h-3.5" /> 追加跟进
              </button>
              {task.status !== 'archived' && task.status !== 'deleted' && (
                <button
                  onClick={() => { onArchiveTask(task.id); setSelectedTask(null); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-black transition-colors"
                  style={{ backgroundColor: statusMap.inProgress.bg, color: statusMap.inProgress.color, border: `1px solid ${statusMap.inProgress.color}40` }}
                >
                  <Archive className="w-3.5 h-3.5" /> 归档
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(`确定删除"${task.clientName}"的记录？此操作可通过状态筛选"已删除"恢复查看。`)) {
                    onDeleteTask(task.id);
                    setSelectedTask(null);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-black transition-colors"
                style={{ backgroundColor: statusMap.urgent.bg, color: statusMap.urgent.color, border: `1px solid ${statusMap.urgent.color}40` }}
              >
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
              <DSBadge
                status={RECORD_STATUS_KEY[task.status] || 'newInquiry'}
                label={getStatusLabel(task.status)}
                className="ml-auto rounded-lg uppercase"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ─── 渲染状态徽章 ──────────────────────────────────────────── */
  const StatusBadge = ({ status }: { status: string }) => (
    <DSBadge
      status={RECORD_STATUS_KEY[status] || 'otherInquiry'}
      label={STATUS_LABELS[status] ?? status}
      className="rounded-lg uppercase"
    />
  );

  /* ─── 渲染业务类型图标 ──────────────────────────────────────── */
  const BizTypeCell = ({ record }: { record: URecord }) => (
    <div className="flex items-center gap-1.5">
      {record.bizType === 'TRADE'    ? <ShoppingBag className="w-3 h-3" style={{ color: GOLD }} />
       : record.bizType === 'PROJECT' ? <Briefcase   className="w-3 h-3" style={{ color: colors.statusInfo }} />
       : <FileSearch className="w-3 h-3 text-slate-400" />}
      <span className="text-[10px] font-black text-slate-600 uppercase">{record.bizTypeLabel}</span>
      {record.source === 'merged' && (
        <DSBadge color={colors.statusInfo} bg="rgba(143,166,212,0.16)" label="关联" size="sm" />
      )}
      {record.source === 'project' && (
        <DSBadge color={GOLD} bg={`${GOLD}18`} label="项目" size="sm" />
      )}
    </div>
  );

  /* ─── Main return ──────────────────────────────────────────── */
  return (
    <div className="space-y-8 animate-fadeIn">
      {selectedTask    && <DetailDrawer task={selectedTask} />}
      {selectedProject && <ProjectDrawer project={selectedProject} />}

      {/* SALES 分区页面标题，跟控制中心/客户跟进保持一致的标题样式 */}
      <h1 className="text-2xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>历史归档</h1>

      {/* 搜索与筛选 */}
      <div className="bg-white rounded-[40px] p-8 shadow-2xl border border-slate-200 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索客户、电话、产品、摘要或跟进备注..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-[24px] outline-none focus:ring-2 focus:ring-slate-300 font-bold text-[13px] transition-all shadow-inner"
            />
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">业务类型</label>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-[13px] font-black text-slate-600 outline-none">
                <option value="all">全部类型</option>
                <option value="TRADE">贸易询盘</option>
                <option value="PROJECT">项目推进</option>
                <option value="LOG_ONLY">仅记录</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">状态筛选</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-[13px] font-black text-slate-600 outline-none">
                <option value="all">全部（不含已删除）</option>
                <option value="todo">跟进中</option>
                <option value="completed">已完成</option>
                <option value="archived">已归档</option>
                <option value="deleted">已删除</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => exportToCSV(taskRecordsForExport)}
                className="text-white px-6 py-3.5 rounded-2xl text-[13px] font-black uppercase flex items-center gap-2 shadow-lg transition-all active:scale-95 hover:opacity-90"
                style={{ backgroundColor: NAVY }}
              >
                <Download className="w-3 h-3" /> 导出 CSV
              </button>
            </div>
          </div>
        </div>
        {/* 统计 — 去重后的业务数量（数据源：Follow-up Log） */}
        <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <span>共 {unifiedRecords.length} 条业务留底</span>
          <span className="text-slate-200">·</span>
          <span>项目型 {unifiedRecords.filter(r => r.bizType === 'PROJECT').length}</span>
          <span className="text-slate-200">·</span>
          <span>贸易型 {unifiedRecords.filter(r => r.bizType === 'TRADE').length}</span>
          <span className="text-slate-200">·</span>
          <span>有编号 {unifiedRecords.filter(r => !!r.bizId).length}</span>
        </div>
      </div>

      {/* 统一数据表格 */}
      <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-6 min-w-[140px]">客户 / 城市</th>
                <th className="px-6 py-6 min-w-[200px]">咨询内容</th>
                <th className="px-6 py-6 min-w-[150px]">产品关键词</th>
                <th className="px-6 py-6 min-w-[200px]">最近跟进</th>
                <th className="px-6 py-6 min-w-[120px]">下次跟进</th>
                <th className="px-6 py-6">状态</th>
                <th className="px-6 py-6">业务类型</th>
                <th className="px-6 py-6">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unifiedRecords.map(record => (
                <tr
                  key={record.key}
                  className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => {
                    if (record.task)         setSelectedTask(record.task);
                    else if (record.project) setSelectedProject(record.project);
                  }}
                >
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      {record.bizId && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded mb-1 self-start"
                          style={{ backgroundColor: '#0F172A10', color: '#0F172A' }}>
                          {record.bizId}
                        </span>
                      )}
                      <span className="font-black text-slate-800 text-sm transition-colors">{record.clientName}</span>
                      <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1 mt-1">
                        <Globe className="w-3 h-3" /> {record.countryCity || '—'}
                      </p>
                      {record.owner && (
                        <p className="text-[9px] text-slate-300 font-bold flex items-center gap-1 mt-0.5">
                          <User className="w-2.5 h-2.5" /> {record.owner}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
                      <p className="text-[13px] font-bold text-slate-700 leading-relaxed line-clamp-2 max-w-[250px]">
                        {record.inquirySummary || '—'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {record.categories
                        ? record.categories.split(/[，,]/).map((cat, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase border border-slate-200">
                              {cat.trim()}
                            </span>
                          ))
                        : record.tradeStatus
                          ? <DSBadge color={GOLD} bg={`${GOLD}18`} label={record.tradeStatus} size="sm" />
                          : <span className="text-slate-300 italic text-[10px] font-bold">—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col gap-1">
                      <p className="text-[13px] font-bold text-slate-500 line-clamp-2 max-w-[250px] italic">
                        {record.lastContent || '—'}
                      </p>
                      <span className="text-[12px] font-black flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }}>
                        查看详情 <ChevronRight className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    {record.nextFollowUpAt
                      ? <div className="flex items-center gap-1.5 text-[10px] font-black uppercase" style={{ color: GOLD }}>
                          <Calendar className="w-3 h-3" /> {new Date(record.nextFollowUpAt).toLocaleDateString()}
                        </div>
                      : <span className="text-slate-300 text-[10px] font-bold">—</span>}
                  </td>
                  <td className="px-6 py-6">
                    <StatusBadge status={record.displayStatus} />
                  </td>
                  <td className="px-6 py-6">
                    <BizTypeCell record={record} />
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(record.sortTime).toLocaleDateString()}
                      </span>
                      <span className="text-[8px] text-slate-300 font-bold">
                        {new Date(record.sortTime).toLocaleTimeString()}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unifiedRecords.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300 gap-4">
              <FileSearch className="w-16 h-16 opacity-10" />
              <p className="text-sm font-black uppercase tracking-widest italic">暂无匹配的记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryView;
