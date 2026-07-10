/**
 * FollowUpDetailDrawer (QuickFollowUpPanel)
 *
 * View mode: shows full record info
 * Edit mode: inline editable fields → saves to local state + Supabase snapshot
 *
 * Notion write-back scope:
 *   ✅ 关闭本次跟进 → Notion 行动状态=暂缓 (via /api/crm/notion-update)
 *   ⚠️ All other edits → localStorage + Supabase snapshot only
 *      (Notion write-back for individual fields not implemented yet)
 */

import React, { useState, useRef } from 'react';
import { FollowUpTask, Proposal } from '../types';
import { uploadFileToDrive } from '../services/driveService';
import {
  X, ChevronRight, MessageSquare, Calendar, Phone, Mail, MapPin,
  User, Clock, CheckCircle2, Archive, Building2, Edit2, Save, XCircle,
  Paperclip, FileText, ChevronDown, ChevronUp, UploadCloud, ExternalLink,
} from 'lucide-react';
import { getTaskBusinessId } from '../utils/businessId';
import { isLikelyNotionPageId } from '../utils/notionId';

// ── Dark theme tokens
const BG    = '#0A1628';
const CARD  = '#0F1E35';
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

const PRIORITY_COLOR: Record<string, string> = { A: '#EF4444', B: '#F59E0B', C: '#64748B' };
const PRIORITY_LABEL: Record<string, string>  = { A: '高优先', B: '正常', C: '低优先' };
const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易询盘', PROJECT: '项目推进', LOG_ONLY: '内部记录',
};

interface Props {
  task: FollowUpTask;
  onClose: () => void;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onViewFull: () => void;
  onArchiveTask?: (id: string) => void;
  onUpdateTask?: (task: FollowUpTask) => void;
}

// ── Shared input style
const inputStyle: React.CSSProperties = {
  background: CARD2,
  border: `1px solid ${BORD}`,
  color: T1,
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 600,
  width: '100%',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: T3,
  marginBottom: '4px',
  display: 'block',
};

// ── InfoRow (view mode)
function InfoRow({
  icon, label, value, empty, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  empty?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: `1px solid ${BORD}`, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <div className="shrink-0 mt-0.5" style={{ color: T3 }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div style={labelStyle}>{label}</div>
        <div className="text-sm font-medium break-words" style={{ color: value ? T1 : T3 }}>
          {value || empty || '—'}
        </div>
      </div>
    </div>
  );
}

export default function QuickFollowUpPanel({
  task, onClose, onSave, onViewFull, onArchiveTask, onUpdateTask,
}: Props) {
  const bizId    = (task as any).businessId || getTaskBusinessId(task.id);
  const priority = task.priority || 'B';
  const typeLabel = TYPE_LABEL[task.businessType || 'TRADE'] ?? '贸易询盘';

  const [tab, setTab]   = useState<'info' | 'action' | 'quotes' | 'proposals'>('info');
  const [proposalUploadStatus, setProposalUploadStatus] = useState<'idle' | 'uploading' | 'ok' | 'fail'>('idle');
  const proposalInputRef = useRef<HTMLInputElement>(null);

  const handleProposalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateTask) return;
    e.target.value = '';
    setProposalUploadStatus('uploading');
    const reader = new FileReader();
    reader.onerror = () => setProposalUploadStatus('fail');
    reader.onload = async (ev) => {
      const dataURL = ev.target?.result as string;
      const propId = `PROP_${Date.now()}`;
      const uploadedAt = new Date().toISOString();
      const newProposal: Proposal = { id: propId, name: file.name, mimeType: file.type, size: file.size, uploadedAt, uploadStatus: 'uploading' };
      const withNew = [...(task.proposals || []), newProposal];
      onUpdateTask({ ...task, proposals: withNew });
      try {
        const result = await uploadFileToDrive(
          { id: propId, name: file.name, type: file.type, data: dataURL, size: file.size, uploadedAt, isAnalyzed: false },
          { businessType: task.businessType, clientName: task.clientName }
        );
        if (result.ok && result.driveUrl) {
          onUpdateTask({ ...task, proposals: withNew.map(p => p.id === propId ? { ...p, driveUrl: result.driveUrl, uploadStatus: 'uploaded' as const } : p) });
          setProposalUploadStatus('ok');
        } else {
          onUpdateTask({ ...task, proposals: withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p) });
          setProposalUploadStatus('fail');
        }
      } catch {
        onUpdateTask({ ...task, proposals: withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p) });
        setProposalUploadStatus('fail');
      }
    };
    reader.readAsDataURL(file);
  };
  const [editing, setEditing] = useState(false);

  // ── Quote history state ───────────────────────────────────────────
  const [quoteData, setQuoteData]     = useState<any>(null);
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

  // Edit form state — initialized from task on each edit open
  const [draft, setDraft] = useState<Partial<FollowUpTask>>({});
  type NotionSync = 'idle' | 'syncing' | 'ok' | 'warn' | 'no_id';
  const [notionSync, setNotionSync] = useState<NotionSync>('idle');

  const openEdit = () => {
    setNotionSync('idle');
    setDraft({
      clientName:    task.clientName,
      countryCity:   task.countryCity,
      owner:         task.owner,
      businessType:  task.businessType,
      goal:          task.goal,
      lastContext:   task.lastContext,
      // Keep full ISO string — date input displays slice(0,10), but we preserve precision here
      nextFollowUpAt: task.nextFollowUpAt,
      phoneE164:     task.phoneE164,
      whatsapp:      task.whatsapp,
      email:         task.email,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft({}); setNotionSync('idle'); };

  const saveEdit = async () => {
    if (!onUpdateTask) { setEditing(false); return; }

    // Normalize nextFollowUpAt: if user changed it via date input (YYYY-MM-DD only), append time
    const rawNfa = draft.nextFollowUpAt ?? task.nextFollowUpAt;
    const normalizedNfa = rawNfa && /^\d{4}-\d{2}-\d{2}$/.test(rawNfa)
      ? rawNfa + 'T00:00:00.000Z'
      : rawNfa;

    // Always spread full original task first, then edited fields on top
    const updated: FollowUpTask = {
      ...task,
      ...draft,
      nextFollowUpAt: normalizedNfa ?? task.nextFollowUpAt,
      updatedAt: new Date().toISOString(),
    };

    console.log('[QuickFollowUpPanel.saveEdit] task.id=', task.id,
      'task.leadId=', task.leadId,
      'task.notionFollowupPageId=', (task as any).notionFollowupPageId,
      'draft=', draft,
      'updated.nextFollowUpAt=', updated.nextFollowUpAt,
      'updated.status=', updated.status,
    );

    onUpdateTask(updated);
    setEditing(false);
    setDraft({});

    // ── Notion sync ─────────────────────────────────────────────────
    const notionPageId = (task as any).notionFollowupPageId || task.leadId;
    if (!isLikelyNotionPageId(notionPageId)) {
      console.log('[QuickFollowUpPanel] No valid Notion page ID — local-only save. pageId=', notionPageId);
      setNotionSync('no_id');
      return;
    }

    setNotionSync('syncing');
    try {
      const res = await fetch('/api/crm/notion-update-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: notionPageId,
          nextFollowUpAt: updated.nextFollowUpAt,
          lastNote: updated.lastContext,
          inquirySummary: updated.goal,
          owner: updated.owner,
          // NOTE: do NOT send status — editing info fields must NOT overwrite 行动状态 in Notion.
          // 行动状态 is only changed via 关闭本次跟进 (archiveTask) or 恢复 (restoreTask).
          businessType: updated.businessType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      console.log('[QuickFollowUpPanel] Notion sync result:', data);
      if (data.ok) {
        setNotionSync('ok');
      } else {
        setNotionSync('warn');
      }
    } catch (err) {
      console.error('[QuickFollowUpPanel] Notion sync failed:', err);
      setNotionSync('warn');
    }
  };

  const set = (k: keyof FollowUpTask, v: string) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  // Follow-up note tab
  const [method,   setMethod]   = useState(METHODS[0]);
  const [content,  setContent]  = useState('');
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

  // Close follow-up confirm
  const [confirmClose, setConfirmClose] = useState(false);
  const handleCloseFollowUp = () => {
    if (!confirmClose) { setConfirmClose(true); return; }
    if (onArchiveTask) onArchiveTask(task.id);
    onClose();
  };

  // Recent history entries
  const recentHistory = (task.history || []).slice(0, 3);

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative flex flex-col h-full shadow-2xl overflow-hidden"
        style={{ width: '440px', maxWidth: '100vw', background: BG, borderLeft: `2px solid ${GOLD}` }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="shrink-0 p-5" style={{ background: CARD, borderBottom: `1px solid ${BORD}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {bizId && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                    style={{ background: `${GOLD}22`, color: GOLD }}>{bizId}</span>
                )}
                <span className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', color: T2 }}>{typeLabel}</span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                  style={{ background: `${PRIORITY_COLOR[priority]}22`, color: PRIORITY_COLOR[priority] }}>
                  {PRIORITY_LABEL[priority]}
                </span>
              </div>
              <h2 className="text-lg font-black leading-tight" style={{ color: T1 }}>
                {task.clientName || '未命名客户'}
              </h2>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: `${GOLD}18`, color: GOLD }}>
                  {task.tradeStatus || '待确认'}
                </span>
                {task.owner && (
                  <span className="text-[10px] font-bold" style={{ color: T2 }}>负责：{task.owner}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Edit toggle */}
              {!editing && tab === 'info' && (
                <button
                  onClick={openEdit}
                  className="p-2 rounded-xl transition-all hover:bg-white/10 flex items-center gap-1 text-xs font-black"
                  style={{ color: GOLD, border: `1px solid ${GOLD}40` }}
                  title="编辑记录"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  编辑
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors ml-1"
                style={{ color: T2 }}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          {!editing && (
            <div className="flex gap-1 mt-4 p-1 rounded-xl" style={{ background: CARD2 }}>
              {([
                ['info',      '客户详情'],
                ['action',    '跟进记录'],
                ['quotes',    '历史报价'],
                ['proposals', '提案'],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setTab(key); if (key === 'quotes') loadQuoteHistory(); if (key === 'proposals') setProposalUploadStatus('idle'); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-black transition-all"
                  style={tab === key ? { background: GOLD, color: '#fff' } : { color: T3 }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {editing && (
            <div className="mt-3 text-xs font-black px-3 py-1.5 rounded-xl"
              style={{ background: `${GOLD}15`, color: GOLD }}>
              ✎ 编辑模式 — 修改后点"保存修改"
            </div>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── EDIT MODE ───── */}
          {editing && (
            <div className="p-5 space-y-4">
              {/* Notice */}
              <div className="p-3 rounded-xl text-xs font-medium" style={{ background: CARD2, color: T2, border: `1px solid ${BORD}` }}>
                ✎ 修改将同步本地 + Notion Follow-up Log（如有已连接页面）
              </div>

              {/* Customer name */}
              <div>
                <label style={labelStyle}>客户名称</label>
                <input value={draft.clientName || ''} onChange={e => set('clientName', e.target.value)}
                  placeholder="客户名称" style={inputStyle} />
              </div>

              {/* Owner */}
              <div>
                <label style={labelStyle}>负责人</label>
                <select value={draft.owner || ''} onChange={e => set('owner', e.target.value)}
                  style={inputStyle}>
                  <option value="">— 选择负责人 —</option>
                  {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Business type */}
              <div>
                <label style={labelStyle}>业务类型</label>
                <select value={draft.businessType || 'TRADE'} onChange={e => set('businessType' as any, e.target.value)}
                  style={inputStyle}>
                  {BIZ_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>

              {/* Goal */}
              <div>
                <label style={labelStyle}>目标 / 下一步行动</label>
                <input value={draft.goal || ''} onChange={e => set('goal', e.target.value)}
                  placeholder="下一步待补充" style={inputStyle} />
              </div>

              {/* Last context */}
              <div>
                <label style={labelStyle}>最近跟进记录 / 备注</label>
                <textarea value={draft.lastContext || ''} onChange={e => set('lastContext', e.target.value)}
                  placeholder="暂无备注" rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {/* Next follow-up date */}
              <div>
                <label style={labelStyle}>下次跟进日期</label>
                <input type="date" value={(draft.nextFollowUpAt || '').slice(0, 10)}
                  onChange={e => set('nextFollowUpAt', e.target.value)}
                  style={inputStyle} />
                <div style={{ fontSize: '10px', color: '#4A6080', marginTop: '3px' }}>
                  修改日期后将自动保留时区信息
                </div>
              </div>

              {/* Contact info */}
              <div className="p-3 rounded-xl space-y-3" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>联系方式</div>
                <div>
                  <label style={labelStyle}>WhatsApp</label>
                  <input value={draft.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)}
                    placeholder="联系方式待补充" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>电话</label>
                  <input value={draft.phoneE164 || ''} onChange={e => set('phoneE164', e.target.value)}
                    placeholder="联系方式待补充" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>邮箱</label>
                  <input type="email" value={draft.email || ''} onChange={e => set('email', e.target.value)}
                    placeholder="邮箱待补充" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>城市 / 地区</label>
                  <input value={draft.countryCity || ''} onChange={e => set('countryCity', e.target.value)}
                    placeholder="地区待补充" style={inputStyle} />
                </div>
              </div>

              {/* Attachment note */}
              <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                <Paperclip className="w-4 h-4 shrink-0" style={{ color: T3 }} />
                <div>
                  <div style={labelStyle}>附件</div>
                  <div className="text-xs font-medium" style={{ color: T3 }}>
                    附件上传将在下一阶段接入
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Notion sync status banner ─── */}
          {!editing && notionSync !== 'idle' && (
            <div className="mx-5 mt-3 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
              style={
                notionSync === 'ok'     ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }
                : notionSync === 'syncing' ? { background: 'rgba(184,150,12,0.1)', color: '#B8960C', border: '1px solid rgba(184,150,12,0.2)' }
                : notionSync === 'no_id' ? { background: 'rgba(100,116,139,0.1)', color: '#7A9CC5', border: '1px solid rgba(100,116,139,0.2)' }
                : { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }
              }>
              {notionSync === 'ok'      && '✓ Notion 已同步'}
              {notionSync === 'syncing' && '⏳ 正在同步 Notion…'}
              {notionSync === 'no_id'   && '本地已保存 · 无 Notion 连接（本地客户）'}
              {notionSync === 'warn'    && '⚠️ 本地已保存，Notion 同步失败，请检查连接'}
            </div>
          )}

          {/* ── VIEW MODE — INFO TAB ─── */}
          {!editing && tab === 'info' && (
            <div className="p-5 space-y-0">
              {/* Next follow-up alert */}
              {task.nextFollowUpAt && (
                <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
                  style={{
                    background: (() => {
                      const d = task.nextFollowUpAt.slice(0, 10);
                      const today = new Date().toISOString().slice(0, 10);
                      return d < today ? 'rgba(239,68,68,0.1)' : d === today ? `${GOLD}15` : CARD2;
                    })(),
                    border: `1px solid ${BORD}`,
                  }}>
                  <Clock className="w-4 h-4 shrink-0" style={{
                    color: (() => {
                      const d = task.nextFollowUpAt.slice(0, 10);
                      const today = new Date().toISOString().slice(0, 10);
                      return d < today ? '#EF4444' : d === today ? GOLD : T2;
                    })()
                  }} />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>下次跟进日期</div>
                    <div className="text-sm font-black" style={{
                      color: (() => {
                        const d = task.nextFollowUpAt.slice(0, 10);
                        const today = new Date().toISOString().slice(0, 10);
                        return d < today ? '#EF4444' : d === today ? GOLD : T1;
                      })()
                    }}>
                      {task.nextFollowUpAt.slice(0, 10)}
                      {task.nextFollowUpAt.slice(0, 10) < new Date().toISOString().slice(0, 10) && (
                        <span className="ml-2 text-[10px] text-red-400 font-black">逾期</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Goal */}
              {(task.goal || task.suggestedAction) && (
                <div className="p-3 rounded-xl mb-4"
                  style={{ background: `${GOLD}0D`, border: `1px solid ${GOLD}25` }}>
                  <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>
                    目标 / 下一步
                  </div>
                  <div className="text-sm font-medium" style={{ color: T1 }}>
                    {task.goal || task.suggestedAction}
                  </div>
                </div>
              )}

              <InfoRow icon={<MessageSquare className="w-3.5 h-3.5" />} label="最近跟进记录"
                value={task.lastContext || (task as any).lastNote} empty="暂无备注"
                onClick={openEdit} />
              <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="WhatsApp / 电话"
                value={[task.whatsapp, task.phoneE164].filter(Boolean).join('  /  ') || null}
                empty="联系方式待补充 — 点击编辑" onClick={openEdit} />
              <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="邮箱"
                value={task.email || null} empty="邮箱待补充 — 点击编辑" onClick={openEdit} />
              <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="城市 / 地区"
                value={task.countryCity || null} empty="地区待补充 — 点击编辑" onClick={openEdit} />
              <InfoRow icon={<User className="w-3.5 h-3.5" />} label="负责人"
                value={task.owner || null} empty="负责人待分配 — 点击编辑" onClick={openEdit} />
              <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label="业务类型"
                value={typeLabel} />

              {/* Attachments */}
              <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORD}` }}>
                <div className="shrink-0 mt-0.5" style={{ color: T3 }}><Paperclip className="w-3.5 h-3.5" /></div>
                <div className="flex-1">
                  <div style={labelStyle}>附件</div>
                  {task.attachments && task.attachments.length > 0 ? (
                    <div className="text-sm font-medium" style={{ color: T1 }}>
                      {task.attachments.length} 个附件
                    </div>
                  ) : (
                    <div className="text-sm font-medium" style={{ color: T3 }}>
                      暂无附件 · 附件上传将在下一阶段接入
                    </div>
                  )}
                </div>
              </div>

              {/* Recent history */}
              {recentHistory.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>历史记录</div>
                  {recentHistory.map((h, i) => (
                    <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: CARD2, color: T2 }}>
                      <span className="font-black" style={{ color: T3 }}>
                        {new Date(h.timestamp).toLocaleDateString('zh-CN')}
                      </span>
                      <span className="ml-2">{h.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {isLikelyNotionPageId((task as any).notionFollowupPageId || task.leadId) && (
                <div className="mt-3 text-[9px] font-bold" style={{ color: T3 }}>
                  Notion 已连接 · 编辑和关闭跟进均可同步
                </div>
              )}
            </div>
          )}

          {/* ── VIEW MODE — FOLLOW-UP TAB ─── */}
          {!editing && tab === 'action' && (
            <div className="p-5 space-y-5">
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                新增跟进记录
              </p>

              {/* Method */}
              <div className="flex flex-wrap gap-2">
                {METHODS.map(m => (
                  <button key={m} onClick={() => setMethod(m)}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                    style={method === m
                      ? { background: GOLD, color: '#fff' }
                      : { background: CARD2, color: T2, border: `1px solid ${BORD}` }}>
                    {m}
                  </button>
                ))}
              </div>

              {/* Content */}
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="跟进内容：客户说了什么？我们怎么回应？下一步？"
                rows={5}
                className="w-full p-4 rounded-2xl text-sm font-medium outline-none resize-none"
                style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }}
                onFocus={e => (e.target.style.borderColor = GOLD)}
                onBlur={e => (e.target.style.borderColor = BORD)}
              />

              {/* Next date */}
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 shrink-0" style={{ color: T3 }} />
                <div className="flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>
                    下次跟进日期
                  </p>
                  <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none"
                    style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }} />
                </div>
              </div>

              {/* Save note */}
              <button onClick={handleSaveNote} disabled={!content.trim()}
                className="w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98]"
                style={saved
                  ? { background: '#10B981', color: '#fff' }
                  : content.trim()
                  ? { background: GOLD, color: '#fff' }
                  : { background: 'rgba(255,255,255,0.06)', color: T3, cursor: 'not-allowed' }}>
                {saved ? '✓ 已保存' : '保存跟进记录'}
              </button>

              {/* Recent notes (after saving, show them) */}
              {recentHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                    最近记录
                  </div>
                  {recentHistory.map((h, i) => (
                    <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: CARD2, color: T2 }}>
                      <span className="font-black block" style={{ color: T3 }}>
                        {new Date(h.timestamp).toLocaleDateString('zh-CN')}
                      </span>
                      <span className="mt-0.5 block">{h.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* ── QUOTES TAB ─── */}
          {!editing && tab === 'quotes' && (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                  {task.clientName} 的历史报价
                </p>
                <button onClick={() => { setQuoteData(null); loadQuoteHistory(); }}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                  style={{ color: T3, background: CARD2 }}>
                  刷新
                </button>
              </div>

              {quoteLoading && (
                <div className="flex items-center gap-2 text-xs font-bold py-4" style={{ color: T3 }}>
                  <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  正在查询历史报价…
                </div>
              )}

              {!quoteLoading && quoteData && !quoteData.ok && (
                <div className="px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
                  {quoteData.error || '查询失败'}
                </div>
              )}

              {!quoteLoading && quoteData?.ok && quoteData.total === 0 && (
                <div className="text-xs font-medium py-4" style={{ color: T3 }}>
                  未找到与「{task.clientName}」相关的报价记录。
                </div>
              )}

              {!quoteLoading && quoteData?.ok && quoteData.total > 0 && (
                <>
                  <div className="text-xs font-bold" style={{ color: GOLD }}>
                    共 {quoteData.total} 张 · 合计 AED {Number(quoteData.totalAmount).toLocaleString()}
                  </div>
                  <div className="space-y-2">
                    {quoteData.quotes.map((q: any) => (
                      <div key={q.id}
                        className="rounded-xl overflow-hidden"
                        style={{ border: `1px solid ${BORD}` }}>
                        {/* Quote header row */}
                        <button
                          className="w-full px-4 py-3 flex items-center gap-2 text-left transition-colors hover:bg-white/5"
                          style={{ background: CARD2 }}
                          onClick={() => setExpandedQuote(expandedQuote === q.id ? null : q.id)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black" style={{ color: T1 }}>{q.quoteNo}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(203,168,92,0.12)', color: GOLD }}>
                                {q.statusZh}
                              </span>
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: T3 }}>
                              {q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}
                              {q.projectName && ` · ${q.projectName}`}
                            </div>
                          </div>
                          <span className="text-sm font-black shrink-0" style={{ color: GOLD }}>
                            AED {Number(q.grandTotal).toLocaleString()}
                          </span>
                          {expandedQuote === q.id
                            ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />
                            : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />}
                        </button>

                        {/* Items */}
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
                                      <span className="float-right font-black" style={{ color: T1 }}>
                                        AED {Number(it.line_total).toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                  {validItems.length === 0 && <div className="text-[10px] font-medium" style={{ color: T3 }}>该报价暂无有效产品明细</div>}
                                  {hiddenCnt > 0 && <div className="text-[10px] font-medium mt-1" style={{ color: T3 }}>已隐藏 {hiddenCnt} 条图片 / 无效明细行</div>}
                                </>
                              );
                            })() : (
                              <div className="text-[10px] font-medium" style={{ color: T3 }}>该报价暂无产品明细</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!quoteLoading && !quoteData && (
                <div className="text-xs font-medium py-4" style={{ color: T3 }}>
                  点击"历史报价"标签自动加载。
                </div>
              )}
            </div>
          )}

          {/* ── PROPOSALS TAB ─── */}
          {!editing && tab === 'proposals' && (
            <div className="p-5 space-y-3">
              {/* Upload status banner */}
              {proposalUploadStatus !== 'idle' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
                  style={
                    proposalUploadStatus === 'uploading' ? { background: 'rgba(99,102,241,0.1)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' } :
                    proposalUploadStatus === 'ok'        ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' } :
                                                          { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }
                  }>
                  {proposalUploadStatus === 'uploading' && <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" /> 正在上传到 Drive…</>}
                  {proposalUploadStatus === 'ok'        && <>✓ 提案已上传 Drive</>}
                  {proposalUploadStatus === 'fail'      && <>✗ Drive 上传失败，请稍后重试</>}
                </div>
              )}

              {/* Proposals list */}
              {task.proposals && task.proposals.length > 0 ? (
                <>
                  <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                    提案文件 ({task.proposals.length})
                  </div>
                  <div className="space-y-2">
                    {task.proposals.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                        <FileText className="w-4 h-4 shrink-0" style={{ color: T3 }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: T1 }}>{p.name}</p>
                          <p className="text-[10px]" style={{ color: T3 }}>
                            {new Date(p.uploadedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {p.uploadStatus === 'uploading' && <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
                          {p.uploadStatus === 'uploaded' && p.driveUrl && (
                            <a href={p.driveUrl} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-colors"
                              style={{ background: `${GOLD}18`, color: GOLD }}>
                              <ExternalLink className="w-3 h-3" /> Drive
                            </a>
                          )}
                          {p.uploadStatus === 'failed' && <span className="text-[10px] font-bold text-red-400">失败</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                  <UploadCloud className="w-8 h-8" style={{ color: T3 }} />
                  <p className="text-xs font-bold" style={{ color: T3 }}>暂无提案文件</p>
                  <p className="text-[10px]" style={{ color: T3 }}>点击下方"上传提案"添加</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="shrink-0 p-4 space-y-2" style={{ borderTop: `1px solid ${BORD}`, background: CARD }}>

          {/* Edit mode: Save / Cancel */}
          {/* Proposals tab — upload button */}
          {!editing && tab === 'proposals' && (
            <>
              <input ref={proposalInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" className="hidden" onChange={handleProposalUpload} />
              <button
                onClick={() => { setProposalUploadStatus('idle'); proposalInputRef.current?.click(); }}
                disabled={proposalUploadStatus === 'uploading'}
                className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: GOLD, color: '#fff' }}>
                <UploadCloud className="w-4 h-4" />
                {proposalUploadStatus === 'uploading' ? '上传中…' : '上传提案'}
              </button>
            </>
          )}

          {editing ? (
            <div className="flex gap-2">
              <button onClick={saveEdit}
                className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all hover:opacity-90"
                style={{ background: GOLD, color: '#fff' }}>
                <Save className="w-4 h-4" /> 保存修改
              </button>
              <button onClick={cancelEdit}
                className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all hover:bg-white/5"
                style={{ border: `1px solid ${BORD}`, color: T2 }}>
                <XCircle className="w-4 h-4" /> 取消
              </button>
            </div>
          ) : (
            <>
              {/* Close follow-up */}
              {onArchiveTask && task.status !== 'archived' && (
                <button onClick={handleCloseFollowUp}
                  className="w-full py-3 rounded-xl text-sm font-black transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={confirmClose
                    ? { background: '#EF4444', color: '#fff' }
                    : { background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}40` }}>
                  <Archive className="w-4 h-4" />
                  {confirmClose ? '确认关闭？再次点击确认' : '关闭本次跟进'}
                </button>
              )}

              {/* Mark complete (coming soon) */}
              <button disabled
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
                style={{ border: `1px solid ${BORD}`, color: T2 }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> 标记完成（Coming Soon）
              </button>

              {/* View full detail */}
              <button onClick={() => { onViewFull(); onClose(); }}
                className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-white/5"
                style={{ border: `1px solid ${BORD}`, color: T2 }}>
                查看业务中心完整详情 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
