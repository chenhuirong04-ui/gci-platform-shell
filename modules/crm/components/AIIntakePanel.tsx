/**
 * AIIntakePanel — AI-first follow-up record entry.
 *
 * Workflow:
 *   Step 1 — User pastes text / uploads files (no required fields)
 *   Step 2 — AI organises a draft card (missing fields shown as 待确认)
 *   Step 3 — User confirms → saved as follow-up record
 *
 * Customer name / country / contact are NEVER required before AI analysis.
 * Internal tasks do not require customer fields at all.
 */

import React, { useRef, useState } from 'react';
import { Attachment, BusinessType, FollowUpTask, Project } from '../types';
import {
  Sparkles, UploadCloud, X, ImageIcon, FileText,
  Trash2, ChevronDown, ChevronUp, User, Globe, Phone, Mail,
  CheckCircle2, AlertCircle, Edit2,
} from 'lucide-react';

const NAVY = '#0F172A';
const GOLD = '#B8960C';

/* ── internal-task detection ──────────────────────────────────────── */
const INTERNAL_KW = [
  'lili', 'novie', '内部', '内部任务', '确认', '跟进一下', '提醒',
  '让lili', '让novie', '让 lili', '让 novie',
  'internal', 'task for', '安排',
];
function isInternalTask(text: string): boolean {
  const t = text.toLowerCase();
  return INTERNAL_KW.some(kw => t.includes(kw.toLowerCase()));
}

/* ── naive AI-mock analyser ───────────────────────────────────────── */
interface FollowUpDraft {
  title: string;
  clientName: string;
  type: BusinessType | 'INTERNAL';
  source: string;
  priority: 'High' | 'Medium' | 'Low';
  assignedTo: string;
  nextAction: string;
  dueDate: string;
  notes: string;
  missingFields: string[];
}

function analyseInput(text: string, hasFiles: boolean): FollowUpDraft {
  const lower = text.toLowerCase();
  const internal = isInternalTask(text);

  // Detect assignee
  let assignedTo = '本人';
  if (/lili/i.test(text)) assignedTo = 'Lili';
  else if (/novie/i.test(text)) assignedTo = 'Novie';

  // Detect type
  let type: BusinessType | 'INTERNAL' = 'TRADE';
  if (internal) type = 'INTERNAL';
  else if (/project|项目|工程|villa|fitout|interior|renovation|ff&e|design|装修|室内/i.test(text))
    type = 'PROJECT';
  else if (/log|仅记录|note|备注/i.test(text))
    type = 'LOG_ONLY';

  // Detect source
  let source = '手动输入';
  if (/whatsapp/i.test(text)) source = 'WhatsApp';
  else if (/email|邮件/i.test(text)) source = '邮件';
  else if (/wechat|微信/i.test(text)) source = '微信';
  else if (hasFiles) source = '附件 / 截图';

  // Detect priority
  let priority: 'High' | 'Medium' | 'Low' = 'Medium';
  if (/urgent|紧急|asap|今天|立刻/i.test(text)) priority = 'High';
  else if (/low|不急|慢慢|暂时/i.test(text)) priority = 'Low';

  // Try to extract customer name: look for company-like tokens
  let clientName = '待确认';
  const companyMatch = text.match(/([A-Z][A-Za-z&\s]{2,30}(?:LLC|FZCO|Ltd|Co|Corp|Group|Trading|Co\.|Ltd\.|Inc|FZE|EST|Establishment))/);
  if (companyMatch) clientName = companyMatch[1].trim();

  // Extract next action hint
  let nextAction = '确认需求并回复';
  if (/confirm|确认/i.test(text)) nextAction = '确认相关信息并回复';
  if (/send|发送|发一下|发报价/i.test(text)) nextAction = '发送报价 / 资料';
  if (/follow.?up|跟进/i.test(text)) nextAction = '跟进进展';
  if (/invoice|发票/i.test(text)) nextAction = '确认发票问题并回复';
  if (internal) nextAction = text.length < 60 ? text.trim() : text.slice(0, 60).trim() + '…';

  // Build title
  let title = '待确认';
  if (internal) {
    // strip actor prefix like "让 Lili"
    title = text.replace(/让\s*(lili|novie|本人)/i, '').trim();
    if (title.length > 50) title = title.slice(0, 50) + '…';
  } else if (text.trim()) {
    title = text.trim().split('\n')[0].slice(0, 60);
    if (text.trim().split('\n')[0].length > 60) title += '…';
  }

  // Missing fields
  const missingFields: string[] = [];
  if (!internal) {
    if (clientName === '待确认') missingFields.push('客户名称');
    missingFields.push('联系方式');
  }

  // Due date: tomorrow
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const dueDate = tom.toISOString().slice(0, 10);

  return {
    title,
    clientName,
    type,
    source,
    priority,
    assignedTo,
    nextAction,
    dueDate,
    notes: text.slice(0, 300),
    missingFields,
  };
}

/* ── type labels ────────────────────────────────────────────────────── */
const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易询盘',
  PROJECT: '项目推进',
  LOG_ONLY: '仅记录',
  INTERNAL: '内部任务',
};

/* ── Props ─────────────────────────────────────────────────────────── */
interface Props {
  onAdd: (task: Partial<FollowUpTask>) => Promise<void>;
  isLoading: boolean;
  projects: Project[];
}

export default function AIIntakePanel({ onAdd, isLoading, projects }: Props) {
  const [rawText, setRawText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [optional, setOptional] = useState({
    clientName: '', countryCity: '', phoneE164: '', whatsapp: '', email: '',
  });
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── has any input ───────────────────────────────────────────────── */
  const hasInput = rawText.trim().length > 0 || attachments.length > 0;

  /* ── file handling ───────────────────────────────────────────────── */
  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const next: Attachment[] = [];
    for (const f of arr) {
      const base64 = await new Promise<string>(res => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(f);
      });
      next.push({
        id: `ATT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: f.name, type: f.type, data: base64,
        size: f.size, uploadedAt: new Date().toISOString(), isAnalyzed: false,
      });
    }
    setAttachments(p => [...p, ...next]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };
  const handlePasteOnArea = (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].kind === 'file') {
        const f = e.clipboardData.items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) handleFiles(files);
  };

  /* ── analyse ─────────────────────────────────────────────────────── */
  const handleAnalyse = () => {
    setErrorMsg('');
    setAnalysing(true);
    // Simulate a short async delay (mock AI)
    setTimeout(() => {
      const text = rawText.trim() ||
        (attachments.length ? `[附件: ${attachments.map(a => a.name).join(', ')}]` : '');
      const result = analyseInput(text, attachments.length > 0);

      // Merge optional fields into draft
      if (optional.clientName.trim()) result.clientName = optional.clientName.trim();
      if (optional.clientName.trim()) {
        result.missingFields = result.missingFields.filter(f => f !== '客户名称');
      }

      setDraft(result);
      setAnalysing(false);
    }, 900);
  };

  /* ── save draft ──────────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!draft) return;
    setErrorMsg('');

    const isInternal = draft.type === 'INTERNAL';
    const clientName = (optional.clientName || draft.clientName === '待确认'
      ? (isInternal ? '' : '未知客户')
      : draft.clientName) || '未知客户';

    const now = new Date().toISOString();
    const contactKey = (
      optional.whatsapp || optional.phoneE164 || optional.email || ''
    ).replace(/[\s+]/g, '').toLowerCase();

    const task: Partial<FollowUpTask> = {
      clientName: isInternal ? '' : clientName,
      countryCity: optional.countryCity || 'Unknown',
      phoneE164: optional.phoneE164,
      whatsapp: optional.whatsapp,
      email: optional.email,
      contactKey,
      businessType: isInternal ? 'LOG_ONLY' : draft.type as BusinessType,
      goal: draft.nextAction,
      lastContext: draft.notes,
      owner: draft.assignedTo === '本人' ? '本人' : draft.assignedTo,
      priority: draft.priority === 'High' ? 'A' : draft.priority === 'Low' ? 'C' : 'B',
      nextFollowUpAt: draft.dueDate + 'T09:00:00.000Z',
      attachments,
      inquirySummary: draft.title,
    };

    try {
      await onAdd(task);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setDraft(null);
        setRawText('');
        setAttachments([]);
        setOptional({ clientName: '', countryCity: '', phoneE164: '', whatsapp: '', email: '' });
      }, 1500);
    } catch {
      setErrorMsg('保存失败，请重试');
    }
  };

  /* ── draft card ─────────────────────────────────────────────────── */
  const renderDraftCard = () => {
    if (!draft) return null;

    const rows: [string, string][] = [
      ['标题', draft.title],
      ['客户', draft.clientName],
      ['类型', TYPE_LABEL[draft.type] ?? draft.type],
      ['来源', draft.source],
      ['优先级', draft.priority],
      ['负责人', draft.assignedTo],
      ['下一步', draft.nextAction],
      ['跟进日期', draft.dueDate],
    ];
    if (draft.missingFields.length) {
      rows.push(['缺少信息', draft.missingFields.join('、')]);
    }

    return (
      <div
        className="rounded-2xl border overflow-hidden mt-4 animate-fadeIn"
        style={{ borderColor: `${GOLD}40` }}
      >
        {/* Card header */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: `${GOLD}15` }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs font-black" style={{ color: NAVY }}>AI 整理草稿</span>
          </div>
          <button
            onClick={() => setDraft(null)}
            className="p-1 rounded-lg hover:bg-white/60 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-100 bg-white">
          {rows.map(([label, val]) => (
            <div key={label} className="flex items-start px-5 py-2.5 gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-16 shrink-0 pt-0.5">
                {label}
              </span>
              <span
                className={`text-xs font-bold flex-1 ${
                  val === '待确认' ? 'text-amber-500' : 'text-slate-700'
                }`}
              >
                {val}
              </span>
            </div>
          ))}
        </div>

        {/* Missing warning */}
        {draft.missingFields.length > 0 && (
          <div className="px-5 py-3 flex items-center gap-2 text-[10px] font-bold text-amber-700 bg-amber-50 border-t border-amber-100">
            <AlertCircle className="w-3 h-3 shrink-0" />
            可在保存后补充缺少的信息，不影响现在保存记录。
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 flex flex-wrap gap-3 bg-white border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={isLoading || saved}
            className="flex-1 min-w-[120px] py-3 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: saved ? '#10B981' : NAVY }}
          >
            {saved ? (
              <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />已保存</span>
            ) : isLoading ? '保存中…' : '保存为跟进记录'}
          </button>
          <button
            onClick={() => setDraft(null)}
            className="px-5 py-3 rounded-2xl text-xs font-black border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 inline mr-1.5" />修改
          </button>
          <button
            onClick={() => { setDraft(null); setRawText(''); setAttachments([]); }}
            className="px-5 py-3 rounded-2xl text-xs font-black border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    );
  };

  /* ── render ──────────────────────────────────────────────────────── */
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5" style={{ color: GOLD }} />
          <h3 className="text-base font-black" style={{ color: NAVY }}>丢给 AI，生成跟进记录</h3>
        </div>
        <p className="text-[11px] font-medium text-slate-400">
          可以先不填客户资料。把 WhatsApp、邮件、截图、文件或一句话丢给 AI，AI 会先整理，再提示缺少哪些信息。
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {['丢进内容', 'AI 整理草稿', '保存跟进记录'].map((s, i) => (
            <React.Fragment key={s}>
              <span
                className={`px-2 py-1 rounded-lg transition-colors ${
                  i === 0 && !draft ? 'text-white' :
                  i === 1 && analysing ? 'text-white' :
                  i === 2 && draft ? 'text-white' : ''
                }`}
                style={
                  (i === 0 && !draft) || (i === 1 && analysing) || (i === 2 && draft)
                    ? { backgroundColor: GOLD }
                    : { backgroundColor: '#F1F5F9', color: '#94A3B8' }
                }
              >
                {i + 1}. {s}
              </span>
              {i < 2 && <span className="text-slate-200">→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* ── Raw text input ── */}
        <textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setDraft(null); }}
          placeholder={
            '把内容粘贴在这里：WhatsApp 消息、邮件内容、一句话说明...\n\n例：让 Lili 今天确认 IFZA 发票问题\n例：IFZA FZCO 问了咖啡机报价，WhatsApp 来的'
          }
          rows={5}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-medium text-slate-700 outline-none resize-none focus:border-slate-400 transition-colors placeholder:text-slate-300 leading-relaxed"
          disabled={!!draft}
        />

        {/* ── File upload zone ── */}
        <div
          tabIndex={0}
          onDragEnter={handleDrag} onDragOver={handleDrag}
          onDragLeave={handleDrag} onDrop={onDrop}
          onPaste={handlePasteOnArea}
          onClick={() => !draft && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl px-5 py-4 flex items-center gap-3 transition-all cursor-pointer select-none ${
            draft ? 'opacity-50 pointer-events-none' :
            isDragging ? 'border-[#B8960C] bg-[#B8960C]/5' :
            'border-slate-200 hover:border-[#B8960C]/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,application/pdf,.xls,.xlsx,.doc,.docx,.txt"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
          <UploadCloud className={`w-5 h-5 shrink-0 ${isDragging ? 'text-[#B8960C]' : 'text-slate-300'}`} />
          <div>
            <p className="text-xs font-bold text-slate-600">
              拖拽截图 / 文件，或点击上传，或 Ctrl+V 粘贴图片
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">支持图片、PDF、Word、Excel、TXT</p>
          </div>
        </div>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-600"
              >
                {att.type.startsWith('image/') ? (
                  <ImageIcon className="w-3 h-3 text-indigo-400" />
                ) : (
                  <FileText className="w-3 h-3 text-slate-400" />
                )}
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments(p => p.filter(a => a.id !== att.id))}
                  className="ml-1 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Optional fields toggle ── */}
        <button
          type="button"
          onClick={() => setShowOptional(v => !v)}
          className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
        >
          {showOptional ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          可选信息（客户资料 / 联系方式）— 不填也可以先分析
        </button>

        {showOptional && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            {[
              { key: 'clientName', label: '客户名称', icon: <User className="w-3 h-3" />, placeholder: '可留空' },
              { key: 'countryCity', label: '国家 / 城市', icon: <Globe className="w-3 h-3" />, placeholder: '如: UAE / Dubai' },
              { key: 'phoneE164', label: '电话', icon: <Phone className="w-3 h-3" />, placeholder: '+971…' },
              { key: 'whatsapp', label: 'WhatsApp', icon: <Phone className="w-3 h-3" />, placeholder: '+971…' },
              { key: 'email', label: '邮箱', icon: <Mail className="w-3 h-3" />, placeholder: '可留空' },
            ].map(({ key, label, icon, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {icon} {label}
                </label>
                <input
                  type="text"
                  value={(optional as any)[key]}
                  onChange={e => setOptional(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 transition-colors placeholder:text-slate-300"
                />
              </div>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMsg}
          </div>
        )}

        {/* ── Primary action ── */}
        {!draft && (
          <button
            type="button"
            onClick={handleAnalyse}
            disabled={!hasInput || analysing}
            className="w-full py-4 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: NAVY }}
          >
            {analysing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                AI 正在整理…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                让 AI 整理成跟进记录
              </>
            )}
          </button>
        )}

        {/* ── AI draft result card ── */}
        {renderDraftCard()}
      </div>
    </div>
  );
}
