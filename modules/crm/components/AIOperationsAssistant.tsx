import React, { useState, useRef, useEffect } from 'react';
import { FollowUpTask } from '../types';
import { extractFBInquiry, FBInquiryResult, extractFormDataFromAttachments } from '../services/geminiService';
import {
  BrainCircuit, Loader2, AlertTriangle, CheckCircle2, Send, RefreshCw, Copy, Check,
  ImagePlus, X,
} from 'lucide-react';

interface ImageItem { name: string; type: string; data: string; }

interface Props {
  tasks: FollowUpTask[];
}

export default function AIOperationsAssistant({ tasks }: Props) {
  const [chatText, setChatText]           = useState('');
  const [images, setImages]               = useState<ImageItem[]>([]);
  const [result, setResult]               = useState<FBInquiryResult | null>(null);
  const [loading, setLoading]             = useState(false);
  const [extractError, setExtractError]   = useState('');
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  const [clientName, setClientName]       = useState('');
  const [product, setProduct]             = useState('');
  const [quantity, setQuantity]           = useState('');
  const [region, setRegion]               = useState('');
  const [phone, setPhone]                 = useState('');
  const [whatsapp, setWhatsapp]           = useState('');
  const [notes, setNotes]                 = useState('');
  const [nextStep, setNextStep]           = useState('');
  const [followUpDate, setFollowUpDate]   = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [owner, setOwner]                 = useState('Chris');
  const [reply, setReply]                 = useState('');
  const [replyCopied, setReplyCopied]     = useState(false);

  const [creating, setCreating]           = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createError, setCreateError]     = useState('');

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const addImageFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const items: ImageItem[] = await Promise.all(arr.map(async f => ({
      name: f.name,
      type: f.type,
      data: await fileToBase64(f),
    })));
    setImages(prev => [...prev, ...items].slice(0, 6)); // max 6 images
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addImageFiles(e.target.files);
    e.target.value = '';
  };

  const [pasteHint, setPasteHint] = useState('');

  // Global paste listener — captures Ctrl+V screenshots anywhere on the page
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addImageFiles(files);
        setPasteHint('截图已捕获');
        setTimeout(() => setPasteHint(''), 2000);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExtract = async () => {
    if (!chatText.trim() && images.length === 0) return;
    setLoading(true);
    setExtractError('');
    setResult(null);
    setCreateSuccess(false);
    try {
      if (images.length > 0) {
        // Image path: use extractFormDataFromAttachments
        const attachments = images.map((img, i) => ({
          id: `img_${i}`,
          name: img.name,
          type: img.type,
          data: img.data,
          size: 0,
          uploadedAt: new Date().toISOString(),
          isAnalyzed: false,
        }));
        const extracted = await extractFormDataFromAttachments(attachments);
        // Map ExtractedFormData → FBInquiryResult shape for the confirm form
        const mapped: FBInquiryResult = {
          clientName:     extracted.customerName || 'FB Lead',
          product:        extracted.keyProducts  || '',
          quantity:       extracted.quantity     || '',
          region:         extracted.countryOrCity || '',
          phone:          extracted.phone        || '',
          whatsapp:       extracted.whatsapp     || '',
          email:          '',
          currentStage:   'New Inquiry',
          nextStep:       extracted.nextAction   || '确认客户需求',
          suggestedReply: '',
          followUpNotes:  extracted.summary      || chatText.slice(0, 200),
        };
        setResult(mapped);
        setClientName(mapped.clientName);
        setProduct(mapped.product);
        setQuantity(mapped.quantity);
        setRegion(mapped.region);
        setPhone(mapped.phone);
        setWhatsapp(mapped.whatsapp);
        setNotes(mapped.followUpNotes);
        setNextStep(mapped.nextStep);
        setReply(mapped.suggestedReply);
      } else {
        // Text path: use extractFBInquiry
        const r = await extractFBInquiry(chatText);
        setResult(r);
        setClientName(r.clientName);
        setProduct(r.product);
        setQuantity(r.quantity);
        setRegion(r.region);
        setPhone(r.phone);
        setWhatsapp(r.whatsapp);
        setNotes(r.followUpNotes);
        setNextStep(r.nextStep);
        setReply(r.suggestedReply);
      }
    } catch (e: any) {
      setExtractError(e?.message || 'AI 提取失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!clientName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/crm/notion-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          tradeStatus: '新询盘',
          businessType: '贸易型',
          followUpNotes: [
            notes,
            product  ? `产品: ${product}` : '',
            quantity ? `数量: ${quantity}` : '',
            region   ? `地区: ${region}`  : '',
            phone    ? `电话: ${phone}`   : '',
            whatsapp ? `WhatsApp: ${whatsapp}` : '',
          ].filter(Boolean).join('\n'),
          nextAction: nextStep,
          nextFollowUpAt: followUpDate,
          followUpDate: new Date().toISOString().slice(0, 10),
          followUpMethod: 'Facebook',
          owner,
          source: 'Facebook',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      setCreateSuccess(true);
      setChatText('');
      setResult(null);
    } catch (e: any) {
      setCreateError(e?.message || '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 transition-all';
  const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block';

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3" style={{ backgroundColor: '#0F172A' }}>
        <div className="p-1.5 rounded-xl" style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)' }}>
          <BrainCircuit className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-black text-white">Lead Intake · FB 询盘导入</div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#B8960C' }}>
            粘贴聊天内容 → AI 识别 → 创建 Notion 记录
          </div>
        </div>
      </div>

      <div className="p-5">
        {createSuccess ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div>
              <div className="text-sm font-black text-emerald-700">已创建 Notion Follow-up Log ✓</div>
              <div className="text-[10px] font-bold text-slate-400 mt-1">
                10分钟内将同步到贸易跟进看板
              </div>
            </div>
            <button
              onClick={() => { setCreateSuccess(false); setResult(null); setChatText(''); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black border border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 再导入一条
            </button>
          </div>
        ) : !result ? (
          /* Step 1: Paste text + upload images */
          <div className="space-y-3">
            {/* Text area */}
            <label className={labelCls}>粘贴聊天内容（可选，支持直接粘贴截图）</label>
            <textarea
              rows={5}
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              placeholder="把 Facebook 聊天记录文字粘贴到这里..."
              className={inputCls + ' resize-none'}
            />

            {/* Image upload */}
            <div>
              <label className={labelCls}>上传截图（支持多张）</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-black border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  <ImagePlus className="w-3.5 h-3.5" /> 选择图片文件
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              <p className="text-[10px] font-bold text-slate-400 mb-2">
                截图后直接 <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">Ctrl+V</kbd> 粘贴即可自动捕获
                {pasteHint && <span className="ml-2 text-emerald-600">{pasteHint}</span>}
              </p>
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img.data} alt={img.name} className="w-20 h-20 object-cover rounded-xl border border-slate-200" />
                      <button
                        onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      ><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400">截图后点「读取剪贴板截图」，或点「选择图片文件」上传</p>
                </div>
              )}
            </div>

            {extractError && (
              <div className="flex items-center gap-2 text-xs font-bold text-red-500">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {extractError}
              </div>
            )}
            <button
              onClick={handleExtract}
              disabled={loading || (!chatText.trim() && images.length === 0)}
              className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0F172A' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 识别中...</>
                : images.length > 0
                ? <><BrainCircuit className="w-4 h-4" /> AI 识别截图 ({images.length} 张)</>
                : <><BrainCircuit className="w-4 h-4" /> AI 识别询盘信息</>
              }
            </button>
          </div>
        ) : (
          /* Step 2: Confirm */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> AI 识别完成，请确认后创建
              </div>
              <button onClick={() => { setResult(null); setImages([]); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                重新粘贴
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>客户名称 *</label>
                <input className={inputCls} value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>产品兴趣</label>
                <input className={inputCls} value={product} onChange={e => setProduct(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>数量</label>
                <input className={inputCls} value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>地区</label>
                <input className={inputCls} value={region} onChange={e => setRegion(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>电话</label>
                <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>WhatsApp</label>
                <input className={inputCls} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>跟进摘要（写入 Notion）</label>
                <textarea rows={3} className={inputCls + ' resize-none'} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>下一步行动</label>
                <input className={inputCls} value={nextStep} onChange={e => setNextStep(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>下次跟进日期</label>
                <input type="date" className={inputCls} value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>负责人</label>
                <select className={inputCls} value={owner} onChange={e => setOwner(e.target.value)}>
                  {['Chris', 'lili', 'novie'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {reply && (
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className={labelCls + ' mb-0'}>建议回复话术</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(reply); setReplyCopied(true); setTimeout(() => setReplyCopied(false), 2000); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600"
                  >
                    {replyCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {replyCopied ? '已复制' : '复制'}
                  </button>
                </div>
                <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic whitespace-pre-wrap">{reply}</p>
              </div>
            )}

            {createError && (
              <div className="flex items-center gap-2 text-xs font-bold text-red-500">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {createError}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating || !clientName.trim()}
              className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ backgroundColor: '#0F172A', color: 'white' }}
            >
              {creating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 创建中...</>
                : <><Send className="w-4 h-4" /> 确认创建 Notion Follow-up Log</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
