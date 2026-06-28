
import React, { useState, useRef, useEffect } from 'react';
import { RoleSide, FollowUpTask, Attachment, BusinessType, Project } from '../types';
import { Language, translations } from '../services/i18n';
import { extractFormDataFromAttachments } from '../services/geminiService';
import { uploadAllAttachmentsToDrive } from '../services/driveService';
import {
  UserPlus, Target, MessageSquare, ShieldCheck,
  User, Paperclip, X, Image as ImageIcon, FileText,
  UploadCloud, Phone, Globe, Mail, Briefcase, Tag, AlertCircle, Trash2, Sparkles
} from 'lucide-react';

interface ManualRecordFormProps {
  onAdd: (task: Partial<FollowUpTask>) => void;
  isLoading: boolean;
  lang: Language;
  projects: Project[];
}

const ManualRecordForm: React.FC<ManualRecordFormProps> = ({ onAdd, isLoading, lang, projects }) => {
  const t = translations['zh']; 
  const initialFormState = {
    clientName: '',
    phoneE164: '',
    whatsapp: '',
    email: '',
    countryCity: '',
    myRole: 'SELLER' as RoleSide,
    businessType: 'TRADE' as BusinessType,
    relatedProjectId: '',
    goal: '推进成交',
    lastContext: '',
    notes: '',
    nextFollowUpAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  };

  const [formData, setFormData] = useState(initialFormState);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [driveStatus, setDriveStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 核心处理函数：文件读取与回显
  const handleFiles = async (files: FileList | File[]) => {
    console.log("UPLOAD:PROCESSING_FILES", files.length);
    const newAttachments: Attachment[] = [];
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      console.log("UPLOAD:READING_FILE", file.name, file.type);
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;
      newAttachments.push({
        id: `ATT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: file.name,
        type: file.type,
        data: base64,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        isAnalyzed: false
      });
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  // 1. 点击上传逻辑
  const handleAreaClick = (e: React.MouseEvent) => {
    console.log("UPLOAD:CLICK");
    // 确保没有被遮挡且 input 存在
    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      console.error("UPLOAD:INPUT_REF_MISSING");
    }
  };

  // 2. 拖拽逻辑 (必须 preventDefault 否则无法触发 drop)
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      console.log(`UPLOAD:${e.type.toUpperCase()}`);
      setIsDragging(true);
    } else {
      setIsDragging(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    console.log("UPLOAD:DROP", files.length);
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  // 3. 粘贴逻辑
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    console.log("UPLOAD:PASTE", items.length);
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      handleFiles(pastedFiles);
    }
  };

  const handleAIExtract = async () => {
    if (attachments.length === 0) {
      setErrorMsg("请先上传图片或文件，再使用 AI 识别");
      return;
    }
    setIsExtracting(true);
    setErrorMsg(null);
    setMissingFields([]);
    try {
      const result = await extractFormDataFromAttachments(attachments);

      // 业务类型映射
      const typeMap: Record<string, BusinessType> = {
        "贸易询盘": "TRADE",
        "项目推进": "PROJECT",
        "仅记录": "LOG_ONLY",
        "内部事项": "LOG_ONLY",
      };

      // 模糊匹配关联项目（按名称包含关系）
      let matchedProjectId = "";
      if (result.relatedProject) {
        const keyword = result.relatedProject.trim().toLowerCase();
        const matched = projects.find(p =>
          p.name.toLowerCase().includes(keyword) || keyword.includes(p.name.toLowerCase())
        );
        if (matched) matchedProjectId = matched.id;
      }

      // 拼接产品/价格补充信息到 notes
      const extraNotes = [
        result.keyProducts  ? `产品：${result.keyProducts}`  : "",
        result.quantity     ? `数量：${result.quantity}`     : "",
        result.price        ? `价格：${result.price}${result.currency ? " " + result.currency : ""}` : "",
        result.nextAction   ? `建议动作：${result.nextAction}` : "",
      ].filter(Boolean).join(" / ");

      setFormData(prev => ({
        ...prev,
        ...(result.recordType && typeMap[result.recordType] ? { businessType: typeMap[result.recordType] } : {}),
        ...(result.customerName  ? { clientName:   result.customerName }  : {}),
        ...(result.countryOrCity ? { countryCity:  result.countryOrCity } : {}),
        ...(result.phone         ? { phoneE164:    result.phone }         : {}),
        ...(result.whatsapp      ? { whatsapp:     result.whatsapp }      : {}),
        ...(result.email         ? { email:        result.email }         : {}),
        ...(matchedProjectId     ? { relatedProjectId: matchedProjectId } : {}),
        // summary 只在用户未填时才覆盖
        ...(result.summary && !prev.lastContext ? { lastContext: result.summary } : {}),
        // 产品/价格等补充到 notes
        ...(extraNotes ? { notes: prev.notes ? `${prev.notes}\n${extraNotes}` : extraNotes } : {}),
      }));

      setMissingFields(result.missingFields || []);
    } catch (err: any) {
      setErrorMsg(`AI识别失败：${err.message || "未知错误，请重试"}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const hasContact = formData.phoneE164.trim() || formData.whatsapp.trim() || formData.email.trim();
    if (!hasContact) {
      setErrorMsg("请至少填写一项联系方式（电话/WhatsApp/邮箱）");
      return;
    }

    // 提交前自动上传附件到 Google Drive，替换 base64 为 driveUrl
    let finalAttachments = attachments;
    setDriveStatus(null);
    if (attachments.some(a => a.data && !a.driveUrl)) {
      setIsUploading(true);
      try {
        const { attachments: uploaded, failedCount } = await uploadAllAttachmentsToDrive(attachments, {
          businessType: formData.businessType,
          clientName:   formData.clientName,
        });
        // driveUrl 合并回原始附件，但保留 data 供后续 AI 话术分析使用
        finalAttachments = attachments.map((orig, i) => {
          const up = uploaded[i];
          return up?.driveUrl ? { ...orig, driveUrl: up.driveUrl } : orig;
        });
        const successCount = uploaded.filter(a => a.driveUrl).length;
        if (failedCount > 0) {
          setDriveStatus({ ok: false, msg: `${failedCount} 个附件上传 Drive 失败，请打开浏览器控制台查看详细错误` });
        } else if (successCount > 0) {
          const urls = uploaded.filter(a => a.driveUrl).map(a => a.driveUrl).join(' | ');
          setDriveStatus({ ok: true, msg: `✓ 已上传到 Drive：${urls}` });
        }
      } catch (err: any) {
        setDriveStatus({ ok: false, msg: `上传异常：${err.message || '未知错误'}` });
      } finally {
        setIsUploading(false);
      }
    }

    const contactKey = (formData.whatsapp || formData.phoneE164 || formData.email || "").replace(/[\s+]/g, "").toLowerCase();
    onAdd({ ...formData, contactKey, attachments: finalAttachments });
    setFormData(initialFormState);
    setAttachments([]);
  };

  return (
    <div className="bg-white rounded-[32px] p-8 shadow-xl border border-slate-200 relative z-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-[#0F172A] p-3 rounded-2xl shadow-lg shadow-slate-300"><UserPlus className="w-6 h-6 text-white" /></div>
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">录入与分流中心</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">上传截图/文件，AI识别后分流到对应业务</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 业务分流与项目关联 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[#B8960C] uppercase tracking-widest flex items-center gap-1 ml-2">
              <Tag className="w-3 h-3" /> 业务分流
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setFormData({...formData, businessType: 'TRADE'})} className={`py-4 rounded-2xl text-[10px] font-black border transition-all ${formData.businessType === 'TRADE' ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-white'}`}>贸易询盘</button>
              <button type="button" onClick={() => setFormData({...formData, businessType: 'PROJECT'})} className={`py-4 rounded-2xl text-[10px] font-black border transition-all ${formData.businessType === 'PROJECT' ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-white'}`}>项目推进</button>
              <button type="button" onClick={() => setFormData({...formData, businessType: 'LOG_ONLY'})} className={`py-4 rounded-2xl text-[10px] font-black border transition-all ${formData.businessType === 'LOG_ONLY' ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-white'}`}>仅记录</button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 ml-2"><Briefcase className="w-3 h-3" /> 关联项目</label>
            <select value={formData.relatedProjectId} onChange={e => setFormData({...formData, relatedProjectId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none cursor-pointer appearance-none">
              <option value="">-- 无项目关联 --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* 客户与地理位置 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 flex items-center gap-1 uppercase ml-2"><User className="w-3 h-3" /> 客户名称</label>
            <input required type="text" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 flex items-center gap-1 uppercase ml-2"><Globe className="w-3 h-3" /> 国家 / 城市</label>
            <input required type="text" value={formData.countryCity} onChange={e => setFormData({...formData, countryCity: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {/* 联系方式 */}
        <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
          <label className="text-xs font-black text-slate-800 uppercase flex items-center gap-2">联系方式 <span className="text-red-500">* 至少填一项</span></label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative group"><Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="电话 (含国家码)" value={formData.phoneE164} onChange={e => setFormData({...formData, phoneE164: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" /></div>
            <div className="relative group"><Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" /><input type="text" placeholder="WhatsApp" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500" /></div>
            <div className="relative group"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="email" placeholder="邮箱地址" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" /></div>
          </div>
          {errorMsg && <p className="text-red-500 text-[10px] font-black flex items-center gap-1 animate-pulse"><AlertCircle className="w-3 h-3" /> {errorMsg}</p>}
        </div>

        {/* 关键：事实附件上传区 */}
        <div className="space-y-3">
          <label className="text-xs font-black text-slate-500 flex items-center gap-1 uppercase ml-2"><Paperclip className="w-3 h-3" /> 事实附件</label>
          <div 
            tabIndex={0}
            onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={onDrop}
            onPaste={handlePaste}
            onClick={handleAreaClick}
            className={`relative border-4 border-dashed rounded-[32px] p-10 flex flex-col items-center justify-center transition-all cursor-pointer outline-none focus:ring-2 focus:ring-[#B8960C]/30 ${isDragging ? 'border-[#0F172A] bg-[#0F172A]/5' : 'border-slate-100 hover:border-[#B8960C]/40 hover:bg-slate-50'}`}
            style={{ pointerEvents: 'auto' }} 
          >
            <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              onChange={(e) => {
                console.log("UPLOAD:INPUT_CHANGE");
                if (e.target.files) handleFiles(e.target.files);
              }} 
              className="hidden" 
              accept="image/*,application/pdf,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.txt"
            />
            <UploadCloud className={`w-12 h-12 mb-3 ${isDragging ? 'text-[#B8960C]' : 'text-slate-300'}`} />
            <span className="text-sm font-black text-slate-800">拖拽文件、点击或在此处粘贴 (Cmd+V)</span>
            <span className="text-[10px] text-slate-400 font-bold mt-1">支持图片、PDF、Word、Excel、PPT、TXT（单个文件最大 10MB）</span>
          </div>
          
          {/* 文件回显列表 */}
          {attachments.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 animate-fadeIn">
              {attachments.map(att => (
                <div key={att.id} className="bg-slate-50 p-2 rounded-xl flex items-center gap-2 border border-slate-100">
                  <div className="shrink-0">
                    {att.type.startsWith('image/') ? <ImageIcon className="w-3 h-3 text-indigo-500" /> : <FileText className="w-3 h-3 text-slate-400" />}
                  </div>
                  <p className="text-[9px] font-bold truncate flex-grow">{att.name}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttachments(prev => prev.filter(a => a.id !== att.id));
                    }}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* AI识别并预填按钮（仅有图片附件时显示，Excel/PDF/Word 不支持 AI 识别） */}
          {attachments.some(a => a.type.startsWith('image/')) && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAIExtract}
                disabled={isExtracting}
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border-2 border-indigo-200 bg-white text-[#B8960C] text-xs font-black hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isExtracting
                  ? <><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />AI识别中...</>
                  : <><Sparkles className="w-4 h-4" />AI识别并预填</>
                }
              </button>
              {missingFields.length > 0 && (
                <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                  ⚠ AI未能识别：{missingFields.join("、")} — 请手动补充
                </p>
              )}
            </div>
          )}
        </div>

        {/* 事实详情 */}
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-500 flex items-center gap-1 uppercase ml-2"><MessageSquare className="w-3 h-3" /> 事实详情</label>
          <textarea value={formData.lastContext} onChange={e => setFormData({...formData, lastContext: e.target.value})} placeholder="请描述当前进展，AI 将根据此内容与附件生成跟进方案..." className="w-full bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-sm font-bold outline-none h-32 resize-none focus:ring-2 focus:ring-indigo-500 shadow-inner" />
        </div>

        {driveStatus && (
          <div className={`text-[10px] font-bold px-4 py-3 rounded-2xl border ${driveStatus.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
            {driveStatus.msg}
          </div>
        )}

        <button type="submit" disabled={isLoading || isUploading} className="w-full bg-[#0F172A] hover:bg-black disabled:bg-slate-300 py-6 rounded-[32px] text-white font-black flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all text-lg relative z-20">
          {(isLoading || isUploading) ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" /> : <Target className="w-6 h-6" />}
          {isUploading ? '上传附件中...' : '分析并分流记录'}
        </button>
      </form>
    </div>
  );
};

export default ManualRecordForm;
