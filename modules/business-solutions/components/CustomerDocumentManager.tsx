/**
 * CustomerDocumentManager
 *
 * Upload flow:
 * 1. User picks file + document type
 * 2. Click "Upload & Parse"
 * 3. File → Supabase Storage (saved immediately)
 * 4. Document record → service_customer_documents
 * 5. File → /api/bs/parse-document (AI extraction)
 * 6. Show editable confirmation form with AI results
 * 7. User confirms → saves to compliance_items OR service_customer_persons
 */
import React, { useState, useEffect, useRef } from 'react';
import type { BSLang } from '../types';
import type { CustomerDocument } from '../lib/bsCloud';
import {
  listCustomerDocuments, saveCustomerDocument, updateCustomerDocument,
  deleteCustomerDocument, uploadDocumentFile, getSignedUrl,
} from '../lib/bsCloud';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

// Document types that AI can parse
const PARSEABLE_TYPES = new Set([
  'TRADE_LICENSE', 'LICENSE_RENEWAL',
  'VAT_CERTIFICATE', 'CORPORATE_TAX_CERTIFICATE',
  'PASSPORT', 'EMIRATES_ID',
  'WORK_VISA', 'INVESTOR_VISA', 'FAMILY_VISA',
]);

// Document types that save to compliance_items (not persons)
const COMPLIANCE_TYPES = new Set([
  'TRADE_LICENSE', 'LICENSE_RENEWAL',
  'VAT_CERTIFICATE', 'CORPORATE_TAX_CERTIFICATE',
]);

// Document types that save to persons
const PERSON_TYPES = new Set([
  'PASSPORT', 'EMIRATES_ID',
  'WORK_VISA', 'INVESTOR_VISA', 'FAMILY_VISA',
]);

const DOC_TYPE_LIST = [
  { key: 'TRADE_LICENSE',              zh: '营业执照',           en: 'Trade License' },
  { key: 'LICENSE_RENEWAL',            zh: '牌照续期',           en: 'License Renewal' },
  { key: 'VAT_CERTIFICATE',            zh: 'VAT Certificate',    en: 'VAT Certificate' },
  { key: 'CORPORATE_TAX_CERTIFICATE',  zh: '企业税证书',          en: 'Corporate Tax Certificate' },
  { key: 'PASSPORT',                   zh: '护照',               en: 'Passport' },
  { key: 'EMIRATES_ID',                zh: 'Emirates ID',        en: 'Emirates ID' },
  { key: 'WORK_VISA',                  zh: '工作签证',            en: 'Work Visa' },
  { key: 'INVESTOR_VISA',              zh: '投资签证',            en: 'Investor Visa' },
  { key: 'FAMILY_VISA',                zh: '家庭签证',            en: 'Family Visa' },
  { key: 'MOA',                        zh: 'MOA / Memorandum',   en: 'MOA / Memorandum' },
  { key: 'BANK',                       zh: '银行资料',            en: 'Bank Documents' },
  { key: 'CONTRACT',                   zh: '合同',               en: 'Contract' },
  { key: 'POA',                        zh: '授权书',             en: 'Power of Attorney' },
  { key: 'OTHER',                      zh: '其他',               en: 'Other' },
];

function expiryDays(d?: string): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

type ExpiryLevel = 'expired' | 'critical' | 'warning' | 'soon' | 'ok' | 'none';
function expiryLevel(d?: string): ExpiryLevel {
  const days = expiryDays(d);
  if (days === null) return 'none';
  if (days < 0)   return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 60) return 'warning';
  if (days <= 90) return 'soon';
  return 'ok';
}
const LEVEL_STYLE = {
  expired:  { bg: '#FEE2E2', text: '#B91C1C' },
  critical: { bg: '#FED7AA', text: '#C2410C' },
  warning:  { bg: '#FEF9C3', text: '#854D0E' },
  soon:     { bg: '#FEF3C7', text: '#92400E' },
  ok:       { bg: '#DCFCE7', text: '#166534' },
  none:     { bg: '#F3F4F6', text: '#6B7280' },
};

// ── AI parse result types ──────────────────────────────────────────────────
interface ParsedCompliance {
  license_number?: string;
  licensee_name?: string;
  trade_name?: string;
  legal_status?: string;
  issuing_authority?: string;
  manager_name?: string;
  issue_date?: string;
  expiry_date?: string;
  premises_number?: string;
  building_name?: string;
  area_name?: string;
  activities?: string[];
  confidence?: string;
}

interface ParsedPerson {
  full_name?: string;
  nationality?: string;
  passport_number?: string;
  passport_expiry_date?: string;
  emirates_id_number?: string;
  emirates_id_expiry_date?: string;
  uid_number?: string;
  visa_number?: string;
  visa_type?: string;
  visa_expiry_date?: string;
  date_of_birth?: string;
  confidence?: string;
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  customerId: string;
  customerName: string;
  lang: BSLang;
  /** Called when a compliance item needs to be created from AI-parsed data */
  onCreateComplianceItem?: (data: {
    documentId: string;
    documentType: string;
    documentName: string;
    parsed: ParsedCompliance;
  }) => void;
  /** Called when a person record needs to be created from AI-parsed data */
  onCreatePerson?: (data: {
    documentId: string;
    documentType: string;
    documentName: string;
    parsed: ParsedPerson;
  }) => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export function CustomerDocumentManager({
  customerId, customerName, lang,
  onCreateComplianceItem, onCreatePerson,
}: Props) {
  const isZh = lang === 'zh';
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs]               = useState<CustomerDocument[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingDoc, setEditingDoc]   = useState<CustomerDocument | null>(null);
  const [saving, setSaving]           = useState(false);
  const [parsing, setParsing]         = useState(false);
  const [error, setError]             = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState<'idle' | 'parsing' | 'done' | 'failed'>('idle');
  const [parseResult, setParseResult] = useState<Record<string, unknown> | null>(null);
  const [parseModel, setParseModel]   = useState('');

  const emptyForm = (): CustomerDocument => ({
    customer_id: customerId,
    document_type: 'TRADE_LICENSE',
    document_name: '',
    issue_date: '',
    expiry_date: '',
    reminder_days: 30,
    notes: '',
    uploaded_by: '',
  });
  const [form, setForm] = useState<CustomerDocument>(emptyForm());

  useEffect(() => { load(); }, [customerId]);

  const load = async () => {
    setLoading(true);
    const data = await listCustomerDocuments(customerId);
    setDocs(data);
    setLoading(false);
  };

  const openAdd = () => {
    setEditingDoc(null);
    setForm(emptyForm());
    setPendingFile(null);
    setParseStatus('idle');
    setParseResult(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (doc: CustomerDocument) => {
    setEditingDoc(doc);
    setForm({ ...doc });
    setPendingFile(null);
    setParseStatus('idle');
    setParseResult(null);
    setError('');
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    setParseStatus('idle');
    setParseResult(null);
    if (!form.document_name) {
      setForm(v => ({ ...v, document_name: f.name.replace(/\.[^.]+$/, '') }));
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Main save handler ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.document_name.trim()) {
      setError(isZh ? '请填写文件名称' : 'Please enter a document name');
      return;
    }
    if (!editingDoc && !pendingFile) {
      setError(isZh ? '请选择文件' : 'Please select a file');
      return;
    }
    setError('');
    setSaving(true);

    let fileUrl  = form.file_url;
    let storagePath = form.storage_path;
    let savedDocId: string | undefined;

    // 1. Upload file to Storage if new file selected
    if (pendingFile) {
      setParsing(true);
      const result = await uploadDocumentFile(customerId, pendingFile);
      setParsing(false);
      if (!result) {
        setError(isZh ? '文件上传失败，请检查 Storage Bucket 是否已创建' : 'Upload failed. Ensure the storage bucket exists.');
        setSaving(false);
        return;
      }
      fileUrl     = result.url;
      storagePath = result.path;
    }

    // 2. Save document record
    const payload: CustomerDocument = {
      ...form,
      file_url:      fileUrl,
      storage_path:  storagePath,
      document_name: form.document_name.trim(),
      issue_date:    form.issue_date  || undefined,
      expiry_date:   form.expiry_date || undefined,
    };

    if (editingDoc?.id) {
      await updateCustomerDocument(editingDoc.id, payload);
      setDocs(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...payload } : d));
      savedDocId = editingDoc.id;
    } else {
      const saved = await saveCustomerDocument(payload);
      if (saved) {
        setDocs(prev => [saved, ...prev]);
        savedDocId = saved.id;
      }
    }

    setSaving(false);
    setShowForm(false);
    setPendingFile(null);

    // 3. If new file + parseable type → auto-parse and trigger confirmation
    if (pendingFile && savedDocId && PARSEABLE_TYPES.has(form.document_type)) {
      await triggerAIParse(pendingFile, form.document_type, form.document_name.trim(), savedDocId);
    }
  };

  // ── AI parse & route to confirmation ──────────────────────────────────
  const triggerAIParse = async (file: File, docType: string, docName: string, docId: string) => {
    setParseStatus('parsing');
    setShowForm(false); // Close upload form, show parse status
    try {
      const base64   = await fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';

      const res = await fetch('/api/bs/parse-document', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mimeType, data: base64, documentType: docType }),
      });
      const data = await res.json();

      if (!data.ok) {
        setParseStatus('failed');
        setError(data.error || 'AI parse failed');
        return;
      }

      setParseResult(data.fields);
      setParseModel(data.model || '');
      setParseStatus('done');

      // Route parsed data to correct handler
      if (COMPLIANCE_TYPES.has(docType) && onCreateComplianceItem) {
        onCreateComplianceItem({ documentId: docId, documentType: docType, documentName: docName, parsed: data.fields });
      } else if (PERSON_TYPES.has(docType) && onCreatePerson) {
        onCreatePerson({ documentId: docId, documentType: docType, documentName: docName, parsed: data.fields });
      }
    } catch (e: any) {
      setParseStatus('failed');
      setError(e?.message || 'Network error during AI parse');
    }
  };

  const handlePreview = async (doc: CustomerDocument) => {
    let url = doc.file_url;
    if (!url && doc.storage_path) url = await getSignedUrl(doc.storage_path) || undefined;
    if (url) window.open(url, '_blank');
    else alert(isZh ? '文件链接不可用' : 'File URL not available');
  };

  const handleDelete = async (doc: CustomerDocument) => {
    if (!window.confirm(isZh ? `确定删除「${doc.document_name}」？` : `Delete "${doc.document_name}"?`)) return;
    if (doc.id) await deleteCustomerDocument(doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const typeLabel = (key: string) => {
    const t = DOC_TYPE_LIST.find(x => x.key === key);
    return t ? (isZh ? t.zh : t.en) : key;
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">{isZh ? '加载中…' : 'Loading…'}</div>;

  const inp: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d9e0',
    fontSize: 13, color: '#17233C', background: 'white', outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 5 };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
            {isZh ? '客户文件' : 'Client Documents'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{docs.length} {isZh ? '份文件' : 'files'}</div>
        </div>
        <button onClick={openAdd} className="text-sm font-black px-4 py-2 rounded-xl text-white" style={{ background: NAVY }}>
          + {isZh ? '上传文件' : 'Upload File'}
        </button>
      </div>

      {/* AI parse status banner */}
      {parseStatus === 'parsing' && (
        <div className="mb-4 p-3 rounded-xl text-sm flex items-center gap-2" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full flex-shrink-0" />
          <span className="text-blue-700 font-bold">
            {isZh ? 'AI 正在识别文件字段…' : 'AI is extracting fields from document…'}
          </span>
        </div>
      )}
      {parseStatus === 'done' && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <span className="text-green-700 font-bold">
            ✓ {isZh ? 'AI 识别完成，请在「证照合规」或「公司人员」Tab 确认并保存' : 'AI extraction complete — confirm fields in Compliance or Persons tab'}
          </span>
          {parseModel && <span className="text-green-500 text-xs ml-2">({parseModel})</span>}
        </div>
      )}
      {parseStatus === 'failed' && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="text-red-700 font-bold">
            ⚠️ {isZh ? 'AI 识别失败，请手动填写字段' : 'AI extraction failed — please fill in fields manually'}
          </div>
          {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
        </div>
      )}

      {/* Upload / Edit Form */}
      {showForm && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {editingDoc ? (isZh ? '编辑文件资料' : 'Edit Document') : (isZh ? '上传新文件' : 'Upload New Document')}
            </p>
            <button onClick={() => { setShowForm(false); setPendingFile(null); }}
              style={{ color: '#8a9ab0', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* File picker */}
            <div>
              <label style={lbl}>
                {isZh ? '选择文件' : 'Select File'}
                {!editingDoc && <span style={{ color: '#e53e3e', marginLeft: 3 }}>*</span>}
              </label>
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors"
                style={{ borderColor: pendingFile ? GOLD : '#d1d9e0' }}
                onClick={() => fileRef.current?.click()}
              >
                {pendingFile ? (
                  <div>
                    <div className="text-sm font-bold" style={{ color: NAVY }}>{pendingFile.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(pendingFile.size / 1024).toFixed(0)} KB · {isZh ? '点击更换' : 'Click to replace'}
                    </div>
                    {PARSEABLE_TYPES.has(form.document_type) && (
                      <div className="text-xs mt-1.5 font-bold" style={{ color: GOLD }}>
                        ✦ {isZh ? '保存后 AI 将自动识别字段' : 'AI will auto-extract fields after upload'}
                      </div>
                    )}
                  </div>
                ) : editingDoc?.file_url ? (
                  <div className="text-xs text-gray-500">
                    {isZh ? '已有文件，点击替换（留空保留原文件）' : 'File exists. Click to replace or leave as-is.'}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    {isZh ? '点击选择 PDF / 图片' : 'Click to select PDF / image'}
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
                onChange={handleFileChange} />
            </div>

            {/* Type + Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>{isZh ? '文件类型' : 'Document Type'}<span style={{ color: '#e53e3e', marginLeft: 3 }}>*</span></label>
                <select style={inp} value={form.document_type}
                  onChange={e => setForm(v => ({ ...v, document_type: e.target.value }))}>
                  {DOC_TYPE_LIST.map(t => (
                    <option key={t.key} value={t.key}>{isZh ? t.zh : t.en}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>{isZh ? '文件名称' : 'Document Name'}<span style={{ color: '#e53e3e', marginLeft: 3 }}>*</span></label>
                <input style={{ ...inp, borderColor: error && !form.document_name ? '#e53e3e' : '#d1d9e0' }}
                  placeholder={isZh ? '如：营业执照 2025' : 'e.g. Trade License 2025'}
                  value={form.document_name}
                  onChange={e => setForm(v => ({ ...v, document_name: e.target.value }))} />
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>{isZh ? '签发日期' : 'Issue Date'}</label>
                <input type="date" style={inp} value={form.issue_date || ''}
                  onChange={e => setForm(v => ({ ...v, issue_date: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '到期日期' : 'Expiry Date'}</label>
                <input type="date" style={inp} value={form.expiry_date || ''}
                  onChange={e => setForm(v => ({ ...v, expiry_date: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '上传人' : 'Uploaded By'}</label>
                <input style={inp} placeholder="Chris / Lili"
                  value={form.uploaded_by || ''}
                  onChange={e => setForm(v => ({ ...v, uploaded_by: e.target.value }))} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={lbl}>{isZh ? '备注' : 'Notes'}</label>
              <input style={inp} placeholder={isZh ? '可选备注…' : 'Optional notes…'}
                value={form.notes || ''}
                onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} />
            </div>

            {error && (
              <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c53030', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving || parsing}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: (saving || parsing) ? 'not-allowed' : 'pointer', border: 'none', background: NAVY, color: 'white' }}>
                {saving || parsing
                  ? (isZh ? '上传中…' : 'Uploading…')
                  : PARSEABLE_TYPES.has(form.document_type) && pendingFile
                  ? (isZh ? '上传并 AI 识别' : 'Upload & AI Parse')
                  : (isZh ? '保存文件' : 'Save Document')}
              </button>
              <button onClick={() => { setShowForm(false); setPendingFile(null); setError(''); }}
                style={{ padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1.5px solid #d1d9e0', background: 'white', color: '#5a6a82' }}>
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">📎</div>
          <div className="text-sm text-gray-500 font-medium">{isZh ? '暂无客户文件' : 'No documents uploaded yet'}</div>
          <div className="text-xs text-gray-400 mt-1">
            {isZh ? '上传营业执照、合同、护照等重要文件' : 'Upload trade licenses, contracts, passports and more'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const lvl = expiryLevel(doc.expiry_date);
            const s   = LEVEL_STYLE[lvl];
            const d   = expiryDays(doc.expiry_date);
            const hasFile = !!(doc.file_url || doc.storage_path);
            return (
              <div key={doc.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e8e0d0', background: 'white' }}>
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: `${NAVY}10` }}>
                    {doc.document_type === 'PASSPORT' ? '🛂'
                      : doc.document_type?.includes('VAT') || doc.document_type?.includes('TAX') ? '🧾'
                      : doc.document_type === 'CONTRACT' ? '📋'
                      : doc.document_type?.includes('VISA') ? '✈️'
                      : doc.document_type === 'EMIRATES_ID' ? '🪪'
                      : '📄'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm" style={{ color: NAVY }}>{doc.document_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${NAVY}10`, color: NAVY }}>
                        {typeLabel(doc.document_type || '')}
                      </span>
                      {doc.expiry_date && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: s.bg, color: s.text }}>
                          {d !== null && d < 0
                            ? (isZh ? `逾期${Math.abs(d)}天` : `${Math.abs(d)}d overdue`)
                            : d !== null
                            ? (isZh ? `还剩${d}天` : `${d}d`)
                            : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                      {doc.issue_date && <span>{isZh ? '签发' : 'Issued'}: {doc.issue_date}</span>}
                      {doc.expiry_date && <span>{isZh ? '到期' : 'Expires'}: {doc.expiry_date}</span>}
                      {doc.uploaded_by && <span>{isZh ? '上传人' : 'By'}: {doc.uploaded_by}</span>}
                      {doc.notes && <span className="truncate max-w-[120px]">{doc.notes}</span>}
                    </div>
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    {hasFile && (
                      <>
                        <button onClick={() => handlePreview(doc)}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                          style={{ background: `${GOLD}20`, color: '#8a6d1c' }}>
                          {isZh ? '预览' : 'View'}
                        </button>
                        <a href={doc.file_url || '#'} target="_blank" rel="noreferrer"
                          onClick={async e => {
                            if (doc.storage_path && !doc.file_url) {
                              e.preventDefault();
                              const url = await getSignedUrl(doc.storage_path);
                              if (url) window.open(url, '_blank');
                            }
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                          style={{ background: `${NAVY}10`, color: NAVY, textDecoration: 'none' }}>
                          {isZh ? '下载' : 'DL'}
                        </a>
                      </>
                    )}
                    <button onClick={() => openEdit(doc)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                      style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      {isZh ? '编辑' : 'Edit'}
                    </button>
                    <button onClick={() => handleDelete(doc)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                      style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                      {isZh ? '删除' : 'Del'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
