/**
 * CustomerWorkspaceBody — reusable customer detail body.
 *
 * Extracted from the former QuickFollowUpPanel drawer (see git history) so
 * the standalone /crm/customer/:customerCode page and any future embed can
 * share one implementation instead of maintaining two parallel detail UIs.
 * All upload / quote-history / follow-up-save logic below is carried over
 * unchanged from QuickFollowUpPanel — only the drawer chrome (backdrop,
 * slide-over width, header nav arrows, footer close/archive buttons) was
 * removed, since the standalone page provides its own top-level chrome.
 *
 * Notion write-back scope (unchanged):
 *   ✅ 关闭本次跟进 → Notion 行动状态=暂缓 (via /api/crm/notion-update, handled by caller)
 *   ⚠️ Other edits → localStorage + Supabase snapshot only
 */

import React, { useState, useRef } from 'react';
import type { FollowUpTask, Proposal } from '../types';
import { uploadFileToDrive } from '../services/driveService';
import {
  MessageSquare, Calendar, Phone, Mail, MapPin,
  User, Clock, Building2, Save, XCircle,
  Paperclip, FileText, ChevronDown, ChevronUp, UploadCloud, ExternalLink,
} from 'lucide-react';
import { isLikelyNotionPageId } from '../utils/notionId';

const BG    = '#0A1628';
const CARD2 = '#162A45';
const BORD  = 'rgba(255,255,255,0.09)';
const GOLD  = '#B8960C';
const T1    = '#E8F0FF';
const T2    = '#7A9CC5';
const T3    = '#4A6080';

const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];
const OWNERS  = ['Chris', 'Lili', 'Jeffrey', 'Yang', '待分配'];
const BIZ_TYPES = [
  { value: 'TRADE',    label: '贸易询盘' },
  { value: 'PROJECT',  label: '项目推进' },
  { value: 'LOG_ONLY', label: '内部记录' },
];
const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易询盘', PROJECT: '项目推进', LOG_ONLY: '内部记录',
};

export type WorkspaceTab = 'info' | 'business' | 'action' | 'files' | 'quotes';

interface TabLabels {
  info: string; business: string; action: string; files: string; quotes: string;
}

interface Props {
  task: FollowUpTask;
  relatedTasks?: FollowUpTask[];
  tab: WorkspaceTab;
  onTabChange: (t: WorkspaceTab) => void;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  tabLabels: TabLabels;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onUpdateTask?: (task: FollowUpTask) => void;
  onUpdateAnyTask?: (task: FollowUpTask) => void;
  onSwitchTask?: (task: FollowUpTask) => void;
}

const inputStyle: React.CSSProperties = {
  background: CARD2, border: `1px solid ${BORD}`, color: T1,
  borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 600,
  width: '100%', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: T3, marginBottom: '4px', display: 'block',
};

function InfoRow({ icon, label, value, empty, onClick }: {
  icon: React.ReactNode; label: string; value?: string | null; empty?: string; onClick?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORD}`, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="shrink-0 mt-0.5" style={{ color: T3 }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div style={labelStyle}>{label}</div>
        <div className="text-sm font-medium break-words" style={{ color: value ? T1 : T3 }}>{value || empty || '—'}</div>
      </div>
    </div>
  );
}

export default function CustomerWorkspaceBody({
  task, relatedTasks = [], tab, onTabChange, editing, onEditingChange, tabLabels,
  onSave, onUpdateTask, onUpdateAnyTask, onSwitchTask,
}: Props) {
  const typeLabel = TYPE_LABEL[task.businessType || 'TRADE'] ?? '贸易询盘';

  const [proposalUploadStatus, setProposalUploadStatus] = useState<'idle' | 'uploading' | 'ok' | 'fail'>('idle');
  const [isDraggingProposal, setIsDraggingProposal] = useState(false);
  const proposalInputRef = useRef<HTMLInputElement>(null);
  const [fileCategory, setFileCategory] = useState<NonNullable<Proposal['category']>>('company_docs');
  const [fileScope, setFileScope] = useState<'customer' | 'business' | 'both'>('customer');
  const [targetTaskId, setTargetTaskId] = useState<string>(task.id);
  const [fileNotes, setFileNotes] = useState('');
  const allCustomerTasks = [task, ...relatedTasks];

  const FILE_CATEGORY_LABELS: Record<string, string> = {
    company_docs: '公司证件', contact_identity: '联系与身份资料',
    product_requirements: '产品与需求资料', business_docs: '商务文件',
    comms_evidence: '沟通证据', other_docs: '其他资料',
    proposal: '提案 / 方案（旧分类）', contract: '合同 / 回签文件（旧分类）',
    project_doc: '项目资料（旧分类）', other: '其他附件（旧分类）',
  };

  const handleProposalFiles = async (files: File[]) => {
    const file = files[0];
    const targetTask = allCustomerTasks.find(t => t.id === targetTaskId) || task;
    const updateTarget = targetTask.id === task.id ? onUpdateTask : (onUpdateAnyTask || onUpdateTask);
    if (!file || !updateTarget) return;
    setProposalUploadStatus('uploading');

    const reader = new FileReader();
    reader.onerror = () => setProposalUploadStatus('fail');
    reader.onload = async (ev) => {
      const dataURL = ev.target?.result as string;
      const propId = `PROP_${Date.now()}`;
      const uploadedAt = new Date().toISOString();
      const newProposal: Proposal = {
        id: propId, name: file.name, mimeType: file.type,
        size: file.size, uploadedAt, uploadStatus: 'uploading',
        category: fileCategory, scope: fileScope, source: '手动上传',
        notes: fileNotes.trim() || undefined,
      };
      const currentProposals = targetTask.proposals || [];
      const withNew = [...currentProposals, newProposal];
      updateTarget({ ...targetTask, proposals: withNew });

      try {
        const result = await uploadFileToDrive(
          { id: propId, name: file.name, type: file.type, data: dataURL, size: file.size, uploadedAt, isAnalyzed: false },
          { businessType: targetTask.businessType, clientName: targetTask.clientName }
        );
        if (result.ok && result.driveUrl) {
          const finalProposals = withNew.map(p => p.id === propId ? { ...p, driveUrl: result.driveUrl, uploadStatus: 'uploaded' as const } : p);
          updateTarget({ ...targetTask, proposals: finalProposals });
          setProposalUploadStatus('ok');
          setFileNotes('');
        } else {
          const finalProposals = withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p);
          updateTarget({ ...targetTask, proposals: finalProposals });
          setProposalUploadStatus('fail');
        }
      } catch {
        const finalProposals = withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p);
        updateTarget({ ...targetTask, proposals: finalProposals });
        setProposalUploadStatus('fail');
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Quote history state — same endpoint/shape as before, unmodified ──────
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);

  const loadQuoteHistory = async () => {
    if (!task.clientName || quoteData !== null) return;
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/ai/quotation-history?customer=${encodeURIComponent(task.clientName)}`);
      const data = await res.json();
      setQuoteData(data);
    } catch { setQuoteData({ ok: false, error: '加载失败，请重试' }); }
    finally { setQuoteLoading(false); }
  };

  const [draft, setDraft] = useState<Partial<FollowUpTask>>({});
  type NotionSync = 'idle' | 'syncing' | 'ok' | 'warn' | 'no_id';
  const [notionSync, setNotionSync] = useState<NotionSync>('idle');

  const openEdit = () => {
    setNotionSync('idle');
    setDraft({
      clientName: task.clientName, countryCity: task.countryCity, owner: task.owner,
      businessType: task.businessType, goal: task.goal, lastContext: task.lastContext,
      nextFollowUpAt: task.nextFollowUpAt, phoneE164: task.phoneE164,
      whatsapp: task.whatsapp, email: task.email,
    });
    onEditingChange(true);
  };

  const cancelEdit = () => { onEditingChange(false); setDraft({}); setNotionSync('idle'); };

  const saveEdit = async () => {
    if (!onUpdateTask) { onEditingChange(false); return; }
    const rawNfa = draft.nextFollowUpAt ?? task.nextFollowUpAt;
    const normalizedNfa = rawNfa && /^\d{4}-\d{2}-\d{2}$/.test(rawNfa) ? rawNfa + 'T00:00:00.000Z' : rawNfa;
    const updated: FollowUpTask = { ...task, ...draft, nextFollowUpAt: normalizedNfa ?? task.nextFollowUpAt, updatedAt: new Date().toISOString() };

    onUpdateTask(updated);
    onEditingChange(false);
    setDraft({});

    const notionPageId = (task as any).notionFollowupPageId || task.leadId;
    if (!isLikelyNotionPageId(notionPageId)) { setNotionSync('no_id'); return; }

    setNotionSync('syncing');
    try {
      const res = await fetch('/api/crm/notion-update-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: notionPageId, nextFollowUpAt: updated.nextFollowUpAt, lastNote: updated.lastContext,
          inquirySummary: updated.goal, owner: updated.owner, businessType: updated.businessType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setNotionSync(data.ok ? 'ok' : 'warn');
    } catch {
      setNotionSync('warn');
    }
  };

  const set = (k: keyof FollowUpTask, v: string) => setDraft(prev => ({ ...prev, [k]: v }));

  const [method, setMethod] = useState(METHODS[0]);
  const [content, setContent] = useState('');
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [saved, setSaved] = useState(false);

  const handleSaveNote = () => {
    if (!content.trim()) return;
    onSave(task.id, { method, content: content.trim(), nextDate });
    setSaved(true);
    setTimeout(() => { setSaved(false); setContent(''); }, 1400);
  };

  const recentHistory = (task.history || []).slice(0, 3);

  return (
    <div>
      {/* Tabs */}
      {!editing && (
        <div className="flex gap-1 mb-5 p-1 rounded-xl max-w-2xl" style={{ background: CARD2 }}>
          {([
            ['info', tabLabels.info],
            ['business', tabLabels.business],
            ['action', tabLabels.action],
            ['files', tabLabels.files],
            ['quotes', tabLabels.quotes],
          ] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => { onTabChange(key); if (key === 'quotes') loadQuoteHistory(); if (key === 'files') setProposalUploadStatus('idle'); }}
              className="flex-1 py-2 rounded-lg text-[12px] font-black transition-all"
              style={tab === key ? { background: GOLD, color: '#fff' } : { color: T3 }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <div className="mb-4 text-xs font-black px-3 py-1.5 rounded-xl inline-block" style={{ background: `${GOLD}15`, color: GOLD }}>
          ✎ 编辑模式 — 修改后点"保存修改"
        </div>
      )}

      {/* ── EDIT MODE ───── */}
      {editing && (
        <div className="space-y-4 max-w-xl">
          <div className="p-3 rounded-xl text-xs font-medium" style={{ background: CARD2, color: T2, border: `1px solid ${BORD}` }}>
            ✎ 修改将同步本地 + Notion Follow-up Log（如有已连接页面）
          </div>
          <div>
            <label style={labelStyle}>客户名称</label>
            <input value={draft.clientName || ''} onChange={e => set('clientName', e.target.value)} placeholder="客户名称" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>负责人</label>
            <select value={draft.owner || ''} onChange={e => set('owner', e.target.value)} style={inputStyle}>
              <option value="">— 选择负责人 —</option>
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>业务类型</label>
            <select value={draft.businessType || 'TRADE'} onChange={e => set('businessType' as any, e.target.value)} style={inputStyle}>
              {BIZ_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>目标 / 下一步行动</label>
            <input value={draft.goal || ''} onChange={e => set('goal', e.target.value)} placeholder="下一步待补充" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>最近跟进记录 / 备注</label>
            <textarea value={draft.lastContext || ''} onChange={e => set('lastContext', e.target.value)} placeholder="暂无备注" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>下次跟进日期</label>
            <input type="date" value={(draft.nextFollowUpAt || '').slice(0, 10)} onChange={e => set('nextFollowUpAt', e.target.value)} style={inputStyle} />
          </div>
          <div className="p-3 rounded-xl space-y-3" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>联系方式</div>
            <div><label style={labelStyle}>WhatsApp</label><input value={draft.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="联系方式待补充" style={inputStyle} /></div>
            <div><label style={labelStyle}>电话</label><input value={draft.phoneE164 || ''} onChange={e => set('phoneE164', e.target.value)} placeholder="联系方式待补充" style={inputStyle} /></div>
            <div><label style={labelStyle}>邮箱</label><input type="email" value={draft.email || ''} onChange={e => set('email', e.target.value)} placeholder="邮箱待补充" style={inputStyle} /></div>
            <div><label style={labelStyle}>城市 / 地区</label><input value={draft.countryCity || ''} onChange={e => set('countryCity', e.target.value)} placeholder="地区待补充" style={inputStyle} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveEdit} className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all hover:opacity-90" style={{ background: GOLD, color: '#fff' }}>
              <Save className="w-4 h-4" /> 保存修改
            </button>
            <button onClick={cancelEdit} className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all hover:bg-white/5" style={{ border: `1px solid ${BORD}`, color: T2 }}>
              <XCircle className="w-4 h-4" /> 取消
            </button>
          </div>
        </div>
      )}

      {!editing && notionSync !== 'idle' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 max-w-2xl"
          style={
            notionSync === 'ok' ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }
            : notionSync === 'syncing' ? { background: 'rgba(184,150,12,0.1)', color: '#B8960C', border: '1px solid rgba(184,150,12,0.2)' }
            : notionSync === 'no_id' ? { background: 'rgba(100,116,139,0.1)', color: '#7A9CC5', border: '1px solid rgba(100,116,139,0.2)' }
            : { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }
          }>
          {notionSync === 'ok' && '✓ Notion 已同步'}
          {notionSync === 'syncing' && '⏳ 正在同步 Notion…'}
          {notionSync === 'no_id' && '本地已保存 · 无 Notion 连接（本地客户）'}
          {notionSync === 'warn' && '⚠️ 本地已保存，Notion 同步失败，请检查连接'}
        </div>
      )}

      {/* ── INFO TAB ─── */}
      {!editing && tab === 'info' && (
        <div className="max-w-2xl space-y-0">
          {(task.goal || task.suggestedAction) && (
            <div className="p-3 rounded-xl mb-4" style={{ background: `${GOLD}0D`, border: `1px solid ${GOLD}25` }}>
              <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>目标 / 下一步</div>
              <div className="text-sm font-medium" style={{ color: T1 }}>{task.goal || task.suggestedAction}</div>
            </div>
          )}
          <InfoRow icon={<MessageSquare className="w-3.5 h-3.5" />} label="最近跟进记录" value={task.lastContext || (task as any).lastNote} empty="暂无备注" onClick={openEdit} />
          <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="WhatsApp / 电话" value={[task.whatsapp, task.phoneE164].filter(Boolean).join('  /  ') || null} empty="联系方式待补充 — 点击编辑" onClick={openEdit} />
          <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="邮箱" value={task.email || null} empty="邮箱待补充 — 点击编辑" onClick={openEdit} />
          <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="城市 / 地区" value={task.countryCity || null} empty="地区待补充 — 点击编辑" onClick={openEdit} />
          <InfoRow icon={<User className="w-3.5 h-3.5" />} label="负责人" value={task.owner || null} empty="负责人待分配 — 点击编辑" onClick={openEdit} />
          <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label="业务类型" value={typeLabel} />
          <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="创建时间" value={task.createdAt ? new Date(task.createdAt).toLocaleDateString('zh-CN') : null} empty="待补充" />
          <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label="最近更新时间" value={task.updatedAt ? new Date(task.updatedAt).toLocaleDateString('zh-CN') : null} empty="待补充" />

          <div className="flex items-start gap-3 py-2.5 cursor-pointer" style={{ borderBottom: `1px solid ${BORD}` }} onClick={() => onTabChange('files')}>
            <div className="shrink-0 mt-0.5" style={{ color: T3 }}><Paperclip className="w-3.5 h-3.5" /></div>
            <div className="flex-1">
              <div style={labelStyle}>客户资料</div>
              {(() => {
                const count = allCustomerTasks.reduce((n, t) => n + (t.proposals?.length || 0), 0);
                return count > 0
                  ? <div className="text-sm font-medium" style={{ color: T1 }}>{count} 份资料 — 点击查看</div>
                  : <div className="text-sm font-medium" style={{ color: T3 }}>暂无客户资料 — 点击前往上传</div>;
              })()}
            </div>
          </div>

          {recentHistory.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>历史记录</div>
              {recentHistory.map((h, i) => (
                <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: CARD2, color: T2 }}>
                  <span className="font-black" style={{ color: T3 }}>{new Date(h.timestamp).toLocaleDateString('zh-CN')}</span>
                  <span className="ml-2">{h.message}</span>
                </div>
              ))}
            </div>
          )}

          {isLikelyNotionPageId((task as any).notionFollowupPageId || task.leadId) && (
            <div className="mt-3 text-[9px] font-bold" style={{ color: T3 }}>Notion 已连接 · 编辑和关闭跟进均可同步</div>
          )}
        </div>
      )}

      {/* ── BUSINESS TAB (项目与业务) ─── */}
      {!editing && tab === 'business' && (
        <div className="max-w-2xl space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
            {task.clientName || '该客户'} 关联的业务（共 {allCustomerTasks.length} 条）
          </p>
          <div className="px-3 py-2.5 rounded-xl" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}40` }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: `${GOLD}30`, color: GOLD }}>当前</span>
              <span className="text-xs font-black" style={{ color: T1 }}>{task.inquirySummary || task.goal || '未命名业务'}</span>
            </div>
            <div className="text-[10px] mt-1" style={{ color: T2 }}>{task.tradeStatus || '—'} · {TYPE_LABEL[task.businessType || 'TRADE']}</div>
          </div>
          {relatedTasks.length === 0 ? (
            <div className="text-xs font-medium py-4" style={{ color: T3 }}>暂无该客户的其他业务记录。</div>
          ) : (
            relatedTasks.map(t => (
              <button key={t.id} onClick={() => onSwitchTask?.(t)} className="w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-white/5" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                <div className="text-xs font-black truncate" style={{ color: T1 }}>{t.inquirySummary || t.goal || '未命名业务'}</div>
                <div className="text-[10px] mt-1 flex items-center justify-between" style={{ color: T2 }}>
                  <span>{t.tradeStatus || '—'} · {TYPE_LABEL[t.businessType || 'TRADE']}</span>
                  <span>{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('zh-CN') : '待补充'}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── FOLLOW-UP TAB (沟通记录) ─── */}
      {!editing && tab === 'action' && (
        <div className="max-w-2xl space-y-5">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>新增跟进记录</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m => (
              <button key={m} onClick={() => setMethod(m)} className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={method === m ? { background: GOLD, color: '#fff' } : { background: CARD2, color: T2, border: `1px solid ${BORD}` }}>
                {m}
              </button>
            ))}
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="跟进内容：客户说了什么？我们怎么回应？下一步？" rows={5}
            className="w-full p-4 rounded-2xl text-sm font-medium outline-none resize-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }}
            onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORD)} />
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 shrink-0" style={{ color: T3 }} />
            <div className="flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>下次跟进日期</p>
              <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }} />
            </div>
          </div>
          <button onClick={handleSaveNote} disabled={!content.trim()} className="w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98]"
            style={saved ? { background: '#10B981', color: '#fff' } : content.trim() ? { background: GOLD, color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: T3, cursor: 'not-allowed' }}>
            {saved ? '✓ 已保存' : '保存跟进记录'}
          </button>
          {recentHistory.length > 0 && (
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>最近记录</div>
              {recentHistory.map((h, i) => (
                <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: CARD2, color: T2 }}>
                  <span className="font-black block" style={{ color: T3 }}>{new Date(h.timestamp).toLocaleDateString('zh-CN')}</span>
                  <span className="mt-0.5 block">{h.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── QUOTES TAB (报价记录) ─── */}
      {!editing && tab === 'quotes' && (
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{task.clientName} 的报价记录</p>
            <button onClick={() => { setQuoteData(null); loadQuoteHistory(); }} className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors" style={{ color: T3, background: CARD2 }}>刷新</button>
          </div>
          {quoteLoading && (
            <div className="flex items-center gap-2 text-xs font-bold py-4" style={{ color: T3 }}>
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> 正在查询报价记录…
            </div>
          )}
          {!quoteLoading && quoteData && !quoteData.ok && (
            <div className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
              暂时无法读取报价记录，请稍后重试。
            </div>
          )}
          {!quoteLoading && quoteData?.ok && quoteData.total === 0 && (
            <div className="text-xs font-medium py-4" style={{ color: T3 }}>未找到与「{task.clientName}」相关的报价记录。</div>
          )}
          {!quoteLoading && quoteData?.ok && quoteData.total > 0 && (
            <>
              <div className="text-xs font-bold" style={{ color: GOLD }}>共 {quoteData.total} 张 · 合计 AED {Number(quoteData.totalAmount).toLocaleString()}</div>
              <div className="space-y-2">
                {quoteData.quotes.map((q: any) => (
                  <div key={q.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORD}` }}>
                    <button className="w-full px-4 py-3 flex items-center gap-2 text-left transition-colors hover:bg-white/5" style={{ background: CARD2 }}
                      onClick={() => setExpandedQuote(expandedQuote === q.id ? null : q.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black" style={{ color: T1 }}>{q.quoteNo}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(203,168,92,0.12)', color: GOLD }}>{q.statusZh}</span>
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: T3 }}>
                          {q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}
                          {q.projectName && ` · ${q.projectName}`}
                        </div>
                      </div>
                      <span className="text-sm font-black shrink-0" style={{ color: GOLD }}>AED {Number(q.grandTotal).toLocaleString()}</span>
                      {expandedQuote === q.id ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />}
                    </button>
                    {expandedQuote === q.id && (
                      <div className="px-4 py-3 space-y-1.5" style={{ background: BG }}>
                        {q.items && q.items.length > 0 ? (() => {
                          const validItems = q.items.filter((it: any) => {
                            const n = (it.item_name || '').trim();
                            if (/^=DISPIMG/i.test(n) || /^=IMAGE/i.test(n)) return false;
                            if (!n && !(it.description || '').trim()) return false;
                            return true;
                          });
                          const hiddenCnt = q.items.length - validItems.length;
                          return (
                            <>
                              {validItems.map((it: any, j: number) => (
                                <div key={j} className="text-xs font-medium" style={{ color: T2 }}>
                                  <span className="font-black" style={{ color: T1 }}>{j + 1}. {it.item_name}</span>
                                  {it.description && <span style={{ color: T3 }}> · {it.description}</span>}
                                  <span style={{ color: T3 }}> · ×{it.qty} {it.unit}</span>
                                  <span style={{ color: GOLD }}> @ AED {Number(it.selling_price).toLocaleString()}</span>
                                  <span className="float-right font-black" style={{ color: T1 }}>AED {Number(it.line_total).toLocaleString()}</span>
                                </div>
                              ))}
                              {validItems.length === 0 && <div className="text-[10px] font-medium" style={{ color: T3 }}>该报价暂无有效产品明细</div>}
                              {hiddenCnt > 0 && <div className="text-[10px] font-medium mt-1" style={{ color: T3 }}>已隐藏 {hiddenCnt} 条图片 / 无效明细行</div>}
                            </>
                          );
                        })() : (
                          <div className="text-[10px] font-medium" style={{ color: T3 }}>该报价暂无产品明细</div>
                        )}

                        {/* Extended fields — only fields the API actually returns
                            (报价类型/币种/关联项目业务). 版本/客户反馈/下一步 have
                            no real data source and are intentionally omitted
                            rather than shown as fabricated 待补充 placeholders. */}
                        <div className="mt-2 pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]" style={{ borderTop: `1px solid ${BORD}` }}>
                          <div><span style={{ color: T3 }}>报价类型：</span><span style={{ color: T2 }}>{q.quoteType || '待补充'}</span></div>
                          <div><span style={{ color: T3 }}>币种：</span><span style={{ color: T2 }}>{q.currency || '待补充'}</span></div>
                          <div className="col-span-2"><span style={{ color: T3 }}>关联项目/业务：</span><span style={{ color: T2 }}>{q.projectName || '待补充'}</span></div>
                        </div>
                        {q.attachments && q.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {q.attachments.map((a: any, ai: number) => a.url ? (
                              <a key={ai} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-colors" style={{ background: `${GOLD}18`, color: GOLD }}>
                                <ExternalLink className="w-3 h-3" /> {a.name || '查看报价文件'}
                              </a>
                            ) : null)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {!quoteLoading && !quoteData && (
            <div className="text-xs font-medium py-4" style={{ color: T3 }}>点击"报价记录"标签自动加载。</div>
          )}
        </div>
      )}

      {/* ── FILES TAB (客户资料) — upload + association on top, list below ─── */}
      {!editing && tab === 'files' && (
        <div className="max-w-2xl space-y-3">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T3 }}>关联范围</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([['customer', '仅关联客户'], ['business', '关联具体项目/业务'], ['both', '同时关联']] as const).map(([sc, label]) => (
                <button key={sc} onClick={() => setFileScope(sc)} className="py-1.5 px-2 rounded-lg text-[10.5px] font-bold transition-all"
                  style={fileScope === sc ? { background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}60` } : { background: CARD2, color: T3, border: `1px solid ${BORD}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(fileScope === 'business' || fileScope === 'both') && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>选择项目 / 业务</p>
              <select value={targetTaskId} onChange={e => setTargetTaskId(e.target.value)} style={inputStyle}>
                {allCustomerTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.id === task.id ? '（当前）' : ''}{t.inquirySummary || t.goal || '未命名业务'}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T3 }}>资料类别</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['company_docs', 'contact_identity', 'product_requirements', 'business_docs', 'comms_evidence', 'other_docs'] as const).map(cat => (
                <button key={cat} onClick={() => setFileCategory(cat)} className="py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-left"
                  style={fileCategory === cat ? { background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}60` } : { background: CARD2, color: T3, border: `1px solid ${BORD}` }}>
                  {FILE_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>说明（可选）</p>
            <input value={fileNotes} onChange={e => setFileNotes(e.target.value)} placeholder="例如：客户签署的合同扫描件" style={inputStyle} />
          </div>

          <div
            onClick={() => { if (proposalUploadStatus !== 'uploading') proposalInputRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingProposal(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDraggingProposal(false); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation(); setIsDraggingProposal(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) handleProposalFiles(files);
            }}
            className="flex flex-col items-center gap-2 py-6 rounded-xl cursor-pointer transition-all"
            style={{ border: `2px dashed ${isDraggingProposal ? GOLD : BORD}`, background: isDraggingProposal ? `${GOLD}0A` : CARD2 }}
          >
            <UploadCloud className="w-7 h-7" style={{ color: isDraggingProposal ? GOLD : T3 }} />
            <p className="text-xs font-black" style={{ color: isDraggingProposal ? GOLD : T2 }}>
              {proposalUploadStatus === 'uploading' ? '上传中…' : '拖拽文件到这里，或点击上传'}
            </p>
            <p className="text-[10px]" style={{ color: T3 }}>PDF · Word · PPT · 图片</p>
          </div>

          <input ref={proposalInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" className="hidden"
            onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length > 0) handleProposalFiles(files); }} />
          <button onClick={() => proposalInputRef.current?.click()} disabled={proposalUploadStatus === 'uploading'}
            className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: GOLD, color: '#fff' }}>
            <UploadCloud className="w-4 h-4" /> {proposalUploadStatus === 'uploading' ? '上传中…' : '选择文件上传'}
          </button>

          {proposalUploadStatus !== 'idle' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
              style={
                proposalUploadStatus === 'uploading' ? { background: 'rgba(99,102,241,0.1)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' } :
                proposalUploadStatus === 'ok' ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' } :
                { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }
              }>
              {proposalUploadStatus === 'uploading' && <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" /> 正在上传到 Drive…</>}
              {proposalUploadStatus === 'ok' && <>✓ {FILE_CATEGORY_LABELS[fileCategory]} 已上传 Drive</>}
              {proposalUploadStatus === 'fail' && <>✗ Drive 上传失败，请稍后重试</>}
            </div>
          )}

          {(() => {
            const allFiles = allCustomerTasks.flatMap(t => (t.proposals || []).map(p => ({ p, sourceTask: t })));
            if (allFiles.length === 0) return null;
            return (
              <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>客户资料 ({allFiles.length})</div>
                {allFiles.map(({ p, sourceTask }) => (
                  <div key={p.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                    <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: T3 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: T1 }}>{p.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: T3 }}>
                        {p.category ? FILE_CATEGORY_LABELS[p.category] + ' · ' : ''}
                        {new Date(p.uploadedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {p.uploadedBy ? ` · 上传人：${p.uploadedBy}` : ''}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: T2 }}>
                        关联客户：{task.clientName || '待补充'} · 关联项目/业务：{sourceTask.inquirySummary || sourceTask.goal || '未命名业务'}
                        {p.scope === 'customer' && ' （标记为客户级）'}
                      </p>
                      {p.source && <p className="text-[10px] mt-0.5" style={{ color: T3 }}>来源：{p.source}</p>}
                      {p.notes && <p className="text-[10px] mt-0.5" style={{ color: T3 }}>说明：{p.notes}</p>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {p.uploadStatus === 'uploading' && <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
                      {p.uploadStatus === 'uploaded' && p.driveUrl && (
                        <a href={p.driveUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-colors" style={{ background: `${GOLD}18`, color: GOLD }}>
                          <ExternalLink className="w-3 h-3" /> 查看/下载
                        </a>
                      )}
                      {p.uploadStatus === 'failed' && <span className="text-[10px] font-bold text-red-400">上传失败</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
