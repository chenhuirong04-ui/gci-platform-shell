/**
 * FollowUpDetailDrawer (QuickFollowUpPanel)
 *
 * Opens when user clicks a follow-up row / 跟进 / 查看详情.
 * Shows full record info + quick follow-up entry form + action buttons.
 * Dark premium styling — matches CRM dark theme.
 */

import React, { useState } from 'react';
import { FollowUpTask } from '../types';
import {
  X, ChevronRight, MessageSquare, Calendar, Phone, Mail, MapPin,
  User, Tag, Clock, CheckCircle2, Archive, Building2, AlertCircle,
} from 'lucide-react';
import { getTaskBusinessId } from '../utils/businessId';

// ── Dark theme tokens (match CRM)
const BG    = '#0A1628';
const CARD  = '#0F1E35';
const CARD2 = '#162A45';
const BORD  = 'rgba(255,255,255,0.09)';
const GOLD  = '#B8960C';
const T1    = '#E8F0FF';
const T2    = '#7A9CC5';
const T3    = '#4A6080';
const NAVY  = '#0F172A';

const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];

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
}

function InfoRow({
  icon, label, value, empty,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  empty?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORD}` }}>
      <div className="shrink-0 mt-0.5" style={{ color: T3 }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: T3 }}>
          {label}
        </div>
        <div
          className="text-sm font-medium break-words"
          style={{ color: value ? T1 : T3 }}
        >
          {value || empty || '—'}
        </div>
      </div>
    </div>
  );
}

export default function QuickFollowUpPanel({ task, onClose, onSave, onViewFull, onArchiveTask }: Props) {
  const bizId    = (task as any).businessId || getTaskBusinessId(task.id);
  const priority = task.priority || 'B';
  const typeLabel = TYPE_LABEL[task.businessType || 'TRADE'] ?? '贸易询盘';

  const [tab, setTab] = useState<'info' | 'action'>('info');
  const [method,   setMethod]   = useState(METHODS[0]);
  const [content,  setContent]  = useState('');
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [saved, setSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const handleSave = () => {
    if (!content.trim()) return;
    onSave(task.id, { method, content: content.trim(), nextDate });
    setSaved(true);
    setTimeout(() => { setSaved(false); setContent(''); }, 1400);
  };

  const handleCloseFollowUp = () => {
    if (!confirmClose) { setConfirmClose(true); return; }
    if (onArchiveTask) onArchiveTask(task.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="relative flex flex-col h-full shadow-2xl overflow-hidden"
        style={{
          width: '420px',
          maxWidth: '100vw',
          background: BG,
          borderLeft: `2px solid ${GOLD}`,
        }}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="shrink-0 p-5" style={{ background: CARD, borderBottom: `1px solid ${BORD}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Business ID chip */}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {bizId && (
                  <span
                    className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                    style={{ background: `${GOLD}22`, color: GOLD }}
                  >
                    {bizId}
                  </span>
                )}
                <span
                  className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', color: T2 }}
                >
                  {typeLabel}
                </span>
                <span
                  className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                  style={{
                    background: `${PRIORITY_COLOR[priority]}22`,
                    color: PRIORITY_COLOR[priority],
                  }}
                >
                  {PRIORITY_LABEL[priority]}
                </span>
              </div>

              {/* Customer name */}
              <h2 className="text-lg font-black leading-tight" style={{ color: T1 }}>
                {task.clientName || '未命名客户'}
              </h2>

              {/* Status + owner */}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: `${GOLD}18`, color: GOLD }}
                >
                  {task.tradeStatus || '待确认'}
                </span>
                {task.owner && (
                  <span className="text-[10px] font-bold" style={{ color: T2 }}>
                    负责：{task.owner}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full shrink-0 transition-colors hover:bg-white/10"
              style={{ color: T2 }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mt-4 p-1 rounded-xl" style={{ background: CARD2 }}>
            {(['info', 'action'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 rounded-lg text-xs font-black transition-all"
                style={
                  tab === t
                    ? { background: GOLD, color: '#fff' }
                    : { color: T3 }
                }
              >
                {t === 'info' ? '客户详情' : '跟进记录'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'info' && (
            <div className="p-5 space-y-0">
              {/* Next follow-up alert */}
              {task.nextFollowUpAt && (
                <div
                  className="flex items-center gap-2 p-3 rounded-xl mb-4"
                  style={{
                    background: (() => {
                      const d = task.nextFollowUpAt.slice(0, 10);
                      const today = new Date().toISOString().slice(0, 10);
                      return d < today
                        ? 'rgba(239,68,68,0.1)'
                        : d === today
                        ? `${GOLD}15`
                        : CARD2;
                    })(),
                    border: `1px solid ${BORD}`,
                  }}
                >
                  <Clock className="w-4 h-4 shrink-0" style={{
                    color: (() => {
                      const d = task.nextFollowUpAt.slice(0, 10);
                      const today = new Date().toISOString().slice(0, 10);
                      return d < today ? '#EF4444' : d === today ? GOLD : T2;
                    })()
                  }} />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                      下次跟进日期
                    </div>
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

              {/* Goal / next action */}
              {(task.goal || task.suggestedAction) && (
                <div className="p-3 rounded-xl mb-4" style={{ background: `${GOLD}0D`, border: `1px solid ${GOLD}25` }}>
                  <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>
                    目标 / 下一步
                  </div>
                  <div className="text-sm font-medium" style={{ color: T1 }}>
                    {task.goal || task.suggestedAction}
                  </div>
                </div>
              )}

              {/* Last context / notes */}
              <InfoRow
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                label="最近跟进记录"
                value={task.lastContext || (task as any).lastNote}
                empty="暂无备注"
              />

              {/* Contact info */}
              <InfoRow
                icon={<Phone className="w-3.5 h-3.5" />}
                label="WhatsApp / 电话"
                value={
                  [task.whatsapp, task.phoneE164].filter(Boolean).join('  /  ') || null
                }
                empty="联系方式待补充"
              />
              <InfoRow
                icon={<Mail className="w-3.5 h-3.5" />}
                label="邮箱"
                value={task.email || null}
                empty="邮箱待补充"
              />
              <InfoRow
                icon={<MapPin className="w-3.5 h-3.5" />}
                label="城市 / 地区"
                value={task.countryCity || null}
                empty="地区待补充"
              />

              {/* Owner */}
              <InfoRow
                icon={<User className="w-3.5 h-3.5" />}
                label="负责人"
                value={task.owner || null}
                empty="负责人待分配"
              />

              {/* Business type */}
              <InfoRow
                icon={<Building2 className="w-3.5 h-3.5" />}
                label="业务类型"
                value={typeLabel}
              />

              {/* Attachments */}
              <InfoRow
                icon={<Tag className="w-3.5 h-3.5" />}
                label="附件"
                value={
                  task.attachments && task.attachments.length > 0
                    ? `${task.attachments.length} 个附件`
                    : null
                }
                empty="暂无附件"
              />

              {/* Notion page ID indicator */}
              {task.leadId && !/^(LEAD_|HIST_)/i.test(task.leadId) && (
                <div className="mt-3 text-[9px] font-bold" style={{ color: T3 }}>
                  Notion 已连接 · 操作可同步
                </div>
              )}
            </div>
          )}

          {tab === 'action' && (
            <div className="p-5 space-y-5">
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                新增跟进记录
              </p>

              {/* Method */}
              <div className="flex flex-wrap gap-2">
                {METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                    style={
                      method === m
                        ? { background: GOLD, color: '#fff' }
                        : { background: CARD2, color: T2, border: `1px solid ${BORD}` }
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Content */}
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="跟进内容：客户说了什么？我们怎么回应？下一步？"
                rows={5}
                className="w-full p-4 rounded-2xl text-sm font-medium outline-none resize-none"
                style={{
                  background: CARD2,
                  border: `1px solid ${BORD}`,
                  color: T1,
                }}
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
                  <input
                    type="date"
                    value={nextDate}
                    onChange={e => setNextDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none"
                    style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }}
                  />
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={!content.trim()}
                className="w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98]"
                style={
                  saved
                    ? { background: '#10B981', color: '#fff' }
                    : content.trim()
                    ? { background: GOLD, color: '#fff' }
                    : { background: 'rgba(255,255,255,0.06)', color: T3, cursor: 'not-allowed' }
                }
              >
                {saved ? '✓ 已保存' : '保存跟进记录'}
              </button>
            </div>
          )}
        </div>

        {/* ── Footer actions ─────────────────────────────────────── */}
        <div className="shrink-0 p-4 space-y-2" style={{ borderTop: `1px solid ${BORD}`, background: CARD }}>

          {/* Primary: close follow-up */}
          {onArchiveTask && task.status !== 'archived' && (
            <button
              onClick={handleCloseFollowUp}
              className="w-full py-3 rounded-xl text-sm font-black transition-all hover:opacity-90 flex items-center justify-center gap-2"
              style={
                confirmClose
                  ? { background: '#EF4444', color: '#fff' }
                  : { background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}40` }
              }
            >
              <Archive className="w-4 h-4" />
              {confirmClose ? '确认关闭本次跟进？再次点击确认' : '关闭本次跟进'}
            </button>
          )}

          {/* Mark complete (disabled for now) */}
          <button
            disabled
            className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
            style={{ border: `1px solid ${BORD}`, color: T2 }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            标记完成（Coming Soon）
          </button>

          {/* View full detail */}
          <button
            onClick={() => { onViewFull(); onClose(); }}
            className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-white/5"
            style={{ border: `1px solid ${BORD}`, color: T2 }}
          >
            查看业务中心完整详情
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
