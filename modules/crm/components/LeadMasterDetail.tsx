
import React, { useState } from 'react';
import { FollowUpTask } from '../types';
import { Language, translations } from '../services/i18n';
import { generateTaskContent } from '../services/geminiService';
import LeadCopilot from './LeadCopilot';
import AILeadAssistant from './AILeadAssistant';
import {
  X, Copy, Check, RefreshCw, MessageSquare, Zap, AlertTriangle,
  CheckSquare, Paperclip, FileText, Sparkles, TrendingUp, ShieldAlert,
  Phone, Mail, Globe, Edit2, Save, Plus, ChevronDown, ChevronUp,
  Archive, Trash2, Target, User,
} from 'lucide-react';

const QUOTATION_CENTER_URL = 'https://gci-living-engineering-studio.vercel.app';
import { getTaskBusinessId } from '../utils/businessId';

interface LeadMasterDetailProps {
  task: FollowUpTask;
  onClose: () => void;
  onUpdateTask: (task: FollowUpTask) => void;
  onArchiveTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  lang: Language;
}

type PanelMode = 'view' | 'edit' | 'append';

const OWNERS = ['Chris', 'lili', 'novie'];
const BIZ_TYPES = ['贸易询盘', '项目推进', '内部事项', '仅记录'];
const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];
const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'paused'];

const LeadMasterDetail: React.FC<LeadMasterDetailProps> = ({ task, onClose, onUpdateTask, onArchiveTask, onDeleteTask, lang }) => {
  const t = translations[lang];
  const [mode, setMode] = useState<PanelMode>('view');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [correction, setCorrection] = useState('');
  const [copySuccess, setCopySuccess] = useState<'final' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSalesCloser, setShowSalesCloser] = useState(false);
  const [notionSync, setNotionSync] = useState<'idle' | 'syncing' | 'ok' | 'warn' | 'no_id'>('idle');

  // ── Edit state ──────────────────────────────────────────────
  const [draft, setDraft] = useState({
    clientName: task.clientName || '',
    whatsapp: task.whatsapp || '',
    phoneE164: task.phoneE164 || '',
    email: task.email || '',
    countryCity: task.countryCity || '',
    inquirySummary: (task as any).inquirySummary || '',
    lastNote: (task as any).lastNote || '',
    nextFollowUpAt: (task as any).nextFollowUpAt || '',
    status: task.status || 'pending',
    businessType: (task as any).businessType || '',
    owner: task.owner || '',
  });

  // ── Append state ─────────────────────────────────────────────
  const [appendData, setAppendData] = useState({
    method: 'WhatsApp',
    content: '',
    nextAction: '',
    nextFollowUpAt: '',
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess('final');
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const response = await generateTaskContent(task, correction);
      const updated: FollowUpTask = {
        ...task,
        draftZH: response.draftZH,
        finalBilingual: response.finalBilingual,
        suggestedAction: response.suggestedAction,
        riskNotice: response.riskNotice,
        aiInsights: response.aiInsights || task.aiInsights,
        updatedAt: new Date().toISOString(),
        history: [...task.history, {
          id: `LOG_${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'CORRECTED',
          message: `User Feedback: ${correction}`,
          payload: { correction }
        }]
      };
      onUpdateTask(updated);
      setCorrection('');
    } catch (err) {
      alert('AI Regeneration Failed');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    const now = new Date().toISOString();
    const updated: FollowUpTask = {
      ...task,
      clientName: draft.clientName,
      whatsapp: draft.whatsapp,
      phoneE164: draft.phoneE164,
      email: draft.email,
      countryCity: draft.countryCity,
      status: draft.status as any,
      owner: draft.owner,
      updatedAt: now,
      ...(draft.inquirySummary ? { inquirySummary: draft.inquirySummary } : {}),
      ...(draft.lastNote ? { lastNote: draft.lastNote } : {}),
      ...(draft.nextFollowUpAt ? { nextFollowUpAt: draft.nextFollowUpAt } : {}),
      ...(draft.businessType ? { businessType: draft.businessType } : {}),
      history: [
        ...task.history,
        {
          id: `EDIT_${Date.now()}`,
          timestamp: now,
          type: 'CORRECTED' as any,
          message: '人工编辑基础信息',
          payload: { ...draft },
        },
      ],
    };
    onUpdateTask(updated);
    setMode('view');

    // ── Sync to Notion Follow-up Log ─────────────────────────────────────────
    const pageId = task.leadId;
    const isLocalId = !pageId || /^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(pageId) || !pageId.includes('-');

    if (isLocalId) {
      setNotionSync('no_id');
      console.warn('[LeadMasterDetail] No Notion pageId for task:', task.id, '— leadId:', pageId);
      return;
    }

    setNotionSync('syncing');
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/crm/notion-update-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          nextFollowUpAt: draft.nextFollowUpAt || undefined,
          lastNote: draft.lastNote || undefined,
          inquirySummary: draft.inquirySummary || undefined,
          owner: draft.owner || undefined,
          status: draft.status || undefined,
          businessType: draft.businessType || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setNotionSync('ok');
        setTimeout(() => setNotionSync('idle'), 4000);
      } else {
        console.error('[LeadMasterDetail] Notion sync failed:', result);
        setNotionSync('warn');
      }
    } catch (e) {
      console.error('[LeadMasterDetail] Notion sync error:', e);
      setNotionSync('warn');
    }
  };

  const handleSaveAppend = () => {
    if (!appendData.content.trim()) return;
    const now = new Date().toISOString();
    const entry = {
      id: `MANUAL_${Date.now()}`,
      timestamp: now,
      type: 'MANUAL_FOLLOWUP' as any,
      message: `[${appendData.method}] ${appendData.content}`,
      summary: appendData.content,
      payload: {
        method: appendData.method,
        content: appendData.content,
        nextAction: appendData.nextAction,
        nextFollowUpAt: appendData.nextFollowUpAt,
      },
    };
    const updated: FollowUpTask = {
      ...task,
      ...(appendData.nextFollowUpAt ? { nextFollowUpAt: appendData.nextFollowUpAt } : {}),
      ...(appendData.content ? { lastNote: appendData.content } : {}),
      updatedAt: now,
      history: [...task.history, entry],
    };
    onUpdateTask(updated);
    setAppendData({ method: 'WhatsApp', content: '', nextAction: '', nextFollowUpAt: '' });
    setMode('view');
  };

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all';
  const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block';

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-slideLeft">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="p-6 bg-[#0F172A] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl shadow-lg" style={{ backgroundColor: '#B8960C' }}>
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight leading-tight">
                {task.clientName}
              </h2>
              {((task as any).businessId || getTaskBusinessId(task.id)) && (
                <p className="text-[10px] font-bold tracking-widest uppercase mt-0.5" style={{ color: '#B8960C' }}>
                  {(task as any).businessId || getTaskBusinessId(task.id)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'view' && (
              <>
                <button
                  onClick={() => setShowSalesCloser(v => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase transition-all"
                  style={showSalesCloser
                    ? { background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0F172A' }
                    : { backgroundColor: 'rgba(184,150,12,0.15)', color: '#D4AF37' }
                  }
                >
                  <Target className="w-3.5 h-3.5" /> 成交助理
                </button>
                {/* 创建报价 → GCI Supply Chain Center (unified entry) */}
                <button
                  onClick={() => {
                    const bizId = (task as any).businessId || getTaskBusinessId(task.id);
                    // TRADE clients → auto-enter Trade & Sourcing; PROJECT/unknown → TypeSelection
                    const isTrade = task.businessType === 'TRADE';
                    const paramObj: Record<string, string> = {
                      client: task.clientName || '',
                      businessId: bizId || '',
                      salesperson: task.owner || '',
                      phone: task.phoneE164 || task.whatsapp || '',
                      source: 'DEAL',
                      returnUrl: 'https://leads.globalcareinfo.com',
                    };
                    if (isTrade) paramObj.quoteType = 'TRADE';
                    window.open(`${QUOTATION_CENTER_URL}?${new URLSearchParams(paramObj).toString()}`, '_blank');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase transition-all"
                  style={{ backgroundColor: 'rgba(184,150,12,0.18)', color: '#D4AF37' }}
                  title="GCI Supply Chain Center — 创建报价"
                >
                  <FileText className="w-3.5 h-3.5" /> 创建报价
                </button>
                <button
                  onClick={() => setMode('edit')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[11px] font-black uppercase transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" /> 编辑
                </button>
              </>
            )}
            {mode !== 'view' && (
              <>
                <button
                  onClick={mode === 'edit' ? handleSaveEdit : handleSaveAppend}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase transition-all hover:opacity-90"
                  style={{ backgroundColor: '#B8960C', color: '#0F172A' }}
                >
                  <Save className="w-3.5 h-3.5" /> 保存
                </button>
                <button
                  onClick={() => setMode('view')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[11px] font-black uppercase transition-all"
                >
                  <X className="w-3.5 h-3.5" /> 取消
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors ml-1">
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </div>

        {/* ── Notion sync status banner ───────────────────────── */}
        {notionSync !== 'idle' && (
          <div className={`px-6 py-2.5 flex items-center gap-2 text-xs font-bold border-b ${
            notionSync === 'syncing' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
            notionSync === 'ok'      ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
            notionSync === 'warn'    ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                       'bg-slate-50 border-slate-100 text-slate-500'
          }`}>
            {notionSync === 'syncing' && <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" /> 正在同步 Notion…</>}
            {notionSync === 'ok'      && <>✓ 已保存并同步 Notion</>}
            {notionSync === 'warn'    && <>⚠ 本地已保存，但 Notion 同步失败，请稍后重试</>}
            {notionSync === 'no_id'   && <>ℹ 该记录缺少 Notion ID，无法更新原 Notion 页面（本地已保存）</>}
          </div>
        )}

        <div className="flex-grow overflow-y-auto bg-[#F8FAFC]">
          <div className="p-6 space-y-6 pb-32">

            {/* ── EDIT MODE ──────────────────────────────────── */}
            {mode === 'edit' && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Edit2 className="w-4 h-4" /> 编辑基础信息
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>客户名称</label>
                    <input className={inputCls} value={draft.clientName} onChange={e => setDraft(d => ({ ...d, clientName: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>国家 / 城市</label>
                    <input className={inputCls} value={draft.countryCity} onChange={e => setDraft(d => ({ ...d, countryCity: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>WhatsApp</label>
                    <input className={inputCls} value={draft.whatsapp} onChange={e => setDraft(d => ({ ...d, whatsapp: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>电话</label>
                    <input className={inputCls} value={draft.phoneE164} onChange={e => setDraft(d => ({ ...d, phoneE164: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>邮件</label>
                    <input className={inputCls} value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>咨询内容 / 需求摘要</label>
                    <textarea rows={2} className={inputCls + ' resize-none'} value={draft.inquirySummary} onChange={e => setDraft(d => ({ ...d, inquirySummary: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>最近跟进备注</label>
                    <textarea rows={2} className={inputCls + ' resize-none'} value={draft.lastNote} onChange={e => setDraft(d => ({ ...d, lastNote: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>下次跟进日期</label>
                    <input type="date" className={inputCls} value={draft.nextFollowUpAt?.slice(0, 10) || ''} onChange={e => setDraft(d => ({ ...d, nextFollowUpAt: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>状态</label>
                    <select className={inputCls} value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>业务类型</label>
                    <select className={inputCls} value={draft.businessType} onChange={e => setDraft(d => ({ ...d, businessType: e.target.value }))}>
                      <option value="">-- 选择 --</option>
                      {BIZ_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>负责人</label>
                    <select className={inputCls} value={draft.owner} onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}>
                      <option value="">-- 选择 --</option>
                      {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </section>
            )}

            {/* ── APPEND MODE ────────────────────────────────── */}
            {mode === 'append' && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-200">
                <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> 追加跟进记录
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>跟进方式</label>
                    <select className={inputCls} value={appendData.method} onChange={e => setAppendData(d => ({ ...d, method: e.target.value }))}>
                      {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>跟进内容 *</label>
                    <textarea
                      rows={4}
                      placeholder="描述本次跟进情况、客户反应、重要信息..."
                      className={inputCls + ' resize-none'}
                      value={appendData.content}
                      onChange={e => setAppendData(d => ({ ...d, content: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>下一步行动</label>
                    <input
                      className={inputCls}
                      placeholder="下一步要做什么..."
                      value={appendData.nextAction}
                      onChange={e => setAppendData(d => ({ ...d, nextAction: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>下次跟进日期</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={appendData.nextFollowUpAt}
                      onChange={e => setAppendData(d => ({ ...d, nextFollowUpAt: e.target.value }))}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* ── VIEW MODE — Contact Card ────────────────────── */}
            {mode === 'view' && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-800">{task.clientName}</h3>
                    <p className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest mt-1">
                      <Globe className="w-3 h-3" /> {task.countryCity}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${task.myRole === 'SELLER' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {task.myRole === 'SELLER' ? t.seller : t.buyer}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{t.owner}: {task.owner}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <a href={`tel:${task.phoneE164}`} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-100 transition-all">
                    <Phone className="w-4 h-4 text-indigo-500" />
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">{t.phone}</span>
                      <span className="text-sm font-bold text-slate-700">{task.phoneE164 || '—'}</span>
                    </div>
                  </a>
                  <a href={`https://wa.me/${(task.whatsapp || '').replace(/\+/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 hover:bg-emerald-100 transition-all">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-[9px] font-black text-emerald-600 uppercase block mb-0.5">{t.whatsapp}</span>
                      <span className="text-sm font-bold text-slate-700">{task.whatsapp || '—'}</span>
                    </div>
                  </a>
                  {task.email && (
                    <a href={`mailto:${task.email}`} className="md:col-span-2 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-all">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <div className="flex-grow">
                        <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">{t.email}</span>
                        <span className="text-sm font-bold text-slate-700">{task.email}</span>
                      </div>
                    </a>
                  )}
                </div>

                {/* 咨询内容 & 最近跟进 */}
                {((task as any).inquirySummary || (task as any).lastNote || task.lastContext) && (
                  <div className="mt-4 space-y-3">
                    {(task as any).inquirySummary && (
                      <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-1">咨询内容</span>
                        <p className="text-sm font-medium text-slate-700">{(task as any).inquirySummary}</p>
                      </div>
                    )}
                    {((task as any).lastNote || task.lastContext) && (
                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block mb-1">最近跟进</span>
                        <p className="text-sm font-medium text-slate-700">{(task as any).lastNote || task.lastContext}</p>
                      </div>
                    )}
                    {(task as any).nextFollowUpAt && (
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">下次跟进：</span>
                        <span className="text-sm font-bold text-slate-700">{(task as any).nextFollowUpAt?.slice(0, 10)}</span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── AI Sales Closer ────────────────────────────── */}
            {mode === 'view' && showSalesCloser && (
              <AILeadAssistant task={task} onUpdateTask={onUpdateTask} />
            )}

            {/* ── AI Copilot ─────────────────────────────────── */}
            {mode === 'view' && <LeadCopilot task={task} />}

            {/* ── History Log (view only) ─────────────────────── */}
            {mode === 'view' && task.history && task.history.length > 0 && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <button
                  onClick={() => setShowHistory(v => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-500" /> 跟进历史 ({task.history.length})
                  </span>
                  {showHistory ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showHistory && (
                  <div className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-1">
                    {[...task.history].reverse().map(h => (
                      <div key={h.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-black text-indigo-500 uppercase">{h.type}</span>
                          <span className="text-[9px] text-slate-400">{new Date(h.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium">{(h as any).summary || h.message || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── AI Insights ─────────────────────────────────── */}
            {mode === 'view' && task.aiInsights && (
              <section className="rounded-2xl p-6 text-white shadow-xl" style={{ backgroundColor: '#0F172A' }}>
                <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-indigo-200">
                  <Sparkles className="w-4 h-4" /> AI {lang === 'zh' ? '深度洞察' : 'Deep Insights'}
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
                    <span className="text-[8px] font-bold text-indigo-200 uppercase block mb-1">{t.price_sensitivity}</span>
                    <span className="text-sm font-black">{task.aiInsights.priceSensitivity}</span>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
                    <span className="text-[8px] font-bold text-indigo-200 uppercase block mb-1">{t.priority}</span>
                    <span className="text-sm font-black">{task.aiInsights.priority}</span>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
                    <span className="text-[8px] font-bold text-indigo-200 uppercase block mb-1">{t.suggested_action}</span>
                    <span className="text-sm font-black truncate">{task.aiInsights.nextActionSuggestion}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-[8px] font-bold text-indigo-200 uppercase block mb-1">{t.real_need}</span>
                    <p className="text-xs font-bold leading-relaxed">{task.aiInsights.realNeed}</p>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <span className="text-[8px] font-bold text-indigo-200 uppercase block mb-1">{t.extracted_facts}</span>
                    <p className="text-[10px] text-indigo-100 italic">{task.aiInsights.extractedFacts}</p>
                  </div>
                </div>
              </section>
            )}

            {/* ── Attachments ─────────────────────────────────── */}
            {mode === 'view' && task.attachments.length > 0 && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-indigo-500" /> {t.attachments}
                </h3>
                <div className="flex flex-wrap gap-3">
                  {task.attachments.map(att => (
                    <div key={att.id} className="w-24 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden group hover:border-indigo-200 transition-all cursor-pointer">
                      <div className="h-16 bg-slate-100 flex items-center justify-center relative">
                        {att.type.startsWith('image/') ? (
                          <img src={att.data} alt="file" className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-6 h-6 text-slate-300" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="text-[8px] font-black text-white uppercase">{t.view_attachment}</span>
                        </div>
                      </div>
                      <div className="p-2 text-center">
                        <p className="text-[8px] font-bold text-slate-600 truncate">{att.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── AI Output (view only) ───────────────────────── */}
            {mode === 'view' && (
              <div className="space-y-6 relative">
                {isRegenerating && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#B8960C', borderTopColor: 'transparent' }} />
                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#B8960C' }}>AI RECALCULATING...</span>
                  </div>
                )}

                {task.draftZH && (
                  <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" /> {t.strategy_advice}
                    </h3>
                    <div className="text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      {task.draftZH}
                    </div>
                  </section>
                )}

                {task.finalBilingual && (
                  <section className="bg-white rounded-2xl overflow-hidden shadow-md border border-slate-200">
                    <div className="bg-[#1E293B] p-5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">{t.bilingual_draft}</h3>
                      </div>
                      <button
                        onClick={() => handleCopy(task.finalBilingual || '')}
                        className="bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase hover:bg-indigo-500 transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
                      >
                        {copySuccess === 'final' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {t.copy_draft}
                      </button>
                    </div>
                    <div className="p-6 bg-white min-h-[150px]">
                      <div className="text-base text-slate-900 font-sans font-medium leading-relaxed whitespace-pre-wrap">
                        {task.finalBilingual}
                      </div>
                    </div>
                    <div className="p-5 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[9px] font-black text-indigo-600 uppercase block mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> {t.suggested_action}</span>
                        <p className="text-[11px] font-bold text-slate-600">{task.suggestedAction || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-red-600 uppercase block mb-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> {t.risk_notice}</span>
                        <p className="text-[11px] font-bold text-slate-600">{task.riskNotice || 'N/A'}</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Feedback / Regenerate */}
                <section className="bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800">
                  <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> {lang === 'zh' ? '策略修正' : 'AI Adjustment'}
                  </h3>
                  <textarea
                    value={correction}
                    onChange={e => setCorrection(e.target.value)}
                    placeholder={t.feedback_placeholder}
                    className="w-full bg-slate-800 text-white p-5 rounded-3xl text-sm border border-slate-700 outline-none h-24 resize-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600 font-bold"
                  />
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating || !correction.trim()}
                    className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white py-4 rounded-3xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-white/5"
                  >
                    <RefreshCw className="w-4 h-4" /> {t.regenerate_btn}
                  </button>
                </section>
              </div>
            )}

          </div>
        </div>

        {/* ── Bottom Bar ─────────────────────────────────────── */}
        <div className="p-6 bg-white border-t border-slate-100 sticky bottom-0 z-[100] shadow-inner">
          {mode === 'view' ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button
                  onClick={() => setMode('append')}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-3.5 rounded-[28px] text-sm font-black text-white shadow-xl flex items-center justify-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" /> 追加跟进
                </button>
                <button
                  onClick={() => { onUpdateTask({ ...task, status: 'completed' }); onClose(); }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 py-3.5 rounded-[28px] text-sm font-black text-white shadow-xl flex items-center justify-center gap-2 transition-all"
                >
                  <CheckSquare className="w-4 h-4" /> {t.complete_round}
                </button>
              </div>
              <div className="flex gap-3">
                {task.status !== 'archived' && task.status !== 'deleted' && (
                  <button
                    onClick={() => { onArchiveTask(task.id); onClose(); }}
                    className="flex-1 py-2.5 rounded-[24px] text-xs font-black flex items-center justify-center gap-1.5 transition-all hover:opacity-80"
                    style={{ background: 'rgba(184,150,12,0.12)', color: '#B8960C', border: '1px solid rgba(184,150,12,0.3)' }}
                  >
                    <Archive className="w-3.5 h-3.5" /> 关闭本次跟进
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm(`确定删除"${task.clientName}"？可在历史记录筛选"已删除"找回。`)) {
                      onDeleteTask(task.id);
                      onClose();
                    }
                  }}
                  className="flex-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 py-2.5 rounded-[24px] text-xs font-black text-rose-600 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={mode === 'edit' ? handleSaveEdit : handleSaveAppend}
                className="flex-1 py-4 rounded-2xl text-sm font-black text-white shadow-md flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: '#0F172A' }}
              >
                <Save className="w-5 h-5" /> 保存
              </button>
              <button
                onClick={() => setMode('view')}
                className="flex-1 bg-slate-200 hover:bg-slate-300 py-4 rounded-2xl text-sm font-black text-slate-700 flex items-center justify-center gap-2 transition-all"
              >
                <X className="w-5 h-5" /> 取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadMasterDetail;
