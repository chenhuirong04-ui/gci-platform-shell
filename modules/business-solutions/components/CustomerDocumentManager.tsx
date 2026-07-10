/**
 * CustomerDocumentManager
 *
 * Flow for parseable types (trade license, VAT, passport, EID, visa):
 *   1. User selects/drops file → AI IMMEDIATELY starts parsing
 *   2. Inline confirmation form with all AI-extracted fields
 *   3. User confirms → file uploaded + document record + compliance/person record all saved at once
 *
 * For non-parseable types: file drop → manual save.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { BSLang } from '../types';
import type { CustomerDocument, ComplianceItem, CustomerPerson } from '../lib/bsCloud';
import {
  listCustomerDocuments, saveCustomerDocument, updateCustomerDocument,
  deleteCustomerDocument, uploadDocumentFile, getSignedUrl,
  saveComplianceItem, savePerson,
} from '../lib/bsCloud';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

// ── Document type catalogue ────────────────────────────────────────────────
const DOC_TYPES = [
  { key: 'TRADE_LICENSE',             zh: '营业执照',           en: 'Trade License',             parseable: true,  dest: 'compliance' as const },
  { key: 'LICENSE_RENEWAL',           zh: '牌照续期',           en: 'License Renewal',           parseable: true,  dest: 'compliance' as const },
  { key: 'VAT_CERTIFICATE',           zh: 'VAT Certificate',    en: 'VAT Certificate',           parseable: true,  dest: 'compliance' as const },
  { key: 'CORPORATE_TAX_CERTIFICATE', zh: '企业税证书',          en: 'Corporate Tax Certificate', parseable: true,  dest: 'compliance' as const },
  { key: 'PASSPORT',                  zh: '护照',               en: 'Passport',                  parseable: true,  dest: 'person'     as const },
  { key: 'EMIRATES_ID',               zh: 'Emirates ID',        en: 'Emirates ID',               parseable: true,  dest: 'person'     as const },
  { key: 'WORK_VISA',                 zh: '工作签证',            en: 'Work Visa',                 parseable: true,  dest: 'person'     as const },
  { key: 'INVESTOR_VISA',             zh: '投资签证',            en: 'Investor Visa',             parseable: true,  dest: 'person'     as const },
  { key: 'FAMILY_VISA',               zh: '家庭签证',            en: 'Family Visa',               parseable: true,  dest: 'person'     as const },
  { key: 'MOA',                       zh: 'MOA / 章程',         en: 'MOA / Memorandum',          parseable: false, dest: null },
  { key: 'BANK',                      zh: '银行资料',            en: 'Bank Documents',            parseable: false, dest: null },
  { key: 'CONTRACT',                  zh: '合同',               en: 'Contract',                  parseable: false, dest: null },
  { key: 'POA',                       zh: '授权书',             en: 'Power of Attorney',         parseable: false, dest: null },
  { key: 'OTHER',                     zh: '其他',               en: 'Other',                     parseable: false, dest: null },
];

const ACCEPTED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'];

function docMeta(key: string) {
  return DOC_TYPES.find(d => d.key === key) ?? DOC_TYPES[DOC_TYPES.length - 1];
}

// ── Expiry badge helpers ───────────────────────────────────────────────────
function daysUntil(d?: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
type Level = 'expired' | 'critical' | 'warning' | 'ok' | 'none';
function expiryLevel(d?: string): Level {
  const n = daysUntil(d);
  if (n === null) return 'none';
  if (n < 0) return 'expired';
  if (n <= 30) return 'critical';
  if (n <= 90) return 'warning';
  return 'ok';
}
const BADGE: Record<Level, { bg: string; text: string }> = {
  expired:  { bg: '#FEE2E2', text: '#B91C1C' },
  critical: { bg: '#FED7AA', text: '#C2410C' },
  warning:  { bg: '#FEF9C3', text: '#854D0E' },
  ok:       { bg: '#DCFCE7', text: '#166534' },
  none:     { bg: '#F3F4F6', text: '#6B7280' },
};

// ── Base64 helper ──────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── AI result shape ────────────────────────────────────────────────────────
interface ParsedFields {
  // compliance
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
  // person
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

// ── Stage machine ──────────────────────────────────────────────────────────
type Stage = 'list' | 'pick' | 'parsing' | 'confirm' | 'saving' | 'edit';

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  customerId: string;
  customerName: string;
  lang: BSLang;
  onComplianceSaved?: () => void;
  onPersonSaved?: () => void;
  // kept for ServiceCustomerDetail compatibility
  onCreateComplianceItem?: (d: { documentId: string; documentType: string; documentName: string; parsed: Record<string, unknown> }) => void;
  onCreatePerson?: (d: { documentId: string; documentType: string; documentName: string; parsed: Record<string, unknown> }) => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export function CustomerDocumentManager({
  customerId, lang,
  onComplianceSaved, onPersonSaved,
  onCreateComplianceItem, onCreatePerson,
}: Props) {
  const isZh = lang === 'zh';
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs]         = useState<CustomerDocument[]>([]);
  const [loading, setLoading]   = useState(true);
  const [stage, setStage]       = useState<Stage>('list');
  const [docType, setDocType]   = useState('TRADE_LICENSE');
  const [docName, setDocName]   = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fields, setFields]     = useState<ParsedFields>({});
  const [activitiesText, setActivitiesText] = useState('');
  const [parseModel, setParseModel] = useState('');
  const [parseError, setParseError] = useState('');
  const [saveError, setSaveError]   = useState('');
  const [editDoc, setEditDoc]   = useState<CustomerDocument | null>(null);
  const [editForm, setEditForm] = useState<CustomerDocument | null>(null);

  useEffect(() => { load(); }, [customerId]);

  const load = async () => {
    setLoading(true);
    setDocs(await listCustomerDocuments(customerId));
    setLoading(false);
  };

  const reset = () => {
    setStage('list'); setFile(null); setDocName(''); setDocType('TRADE_LICENSE');
    setFileError(''); setDragOver(false);
    setFields({}); setActivitiesText(''); setParseModel(''); setParseError('');
    setSaveError(''); setEditDoc(null); setEditForm(null);
  };

  // ── File validation ────────────────────────────────────────────────────
  const pick = useCallback(async (f: File) => {
    setFileError('');
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['png','jpg','jpeg','gif','webp','pdf'].includes(ext)) {
      setFileError(isZh
        ? `不支持的格式「.${ext.toUpperCase()}」，请上传 PNG、JPG 或 PDF`
        : `Unsupported format ".${ext}". Please use PNG, JPG or PDF.`);
      return;
    }
    setFile(f);
    if (!docName) setDocName(f.name.replace(/\.[^.]+$/, ''));

    const meta = docMeta(docType);
    if (meta.parseable) {
      await runAIParse(f, docType);
    }
    // non-parseable stays in 'pick' stage for manual save
  }, [docType, docName, isZh]);

  // ── Drag & Drop ────────────────────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pick(f);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) pick(f);
    e.target.value = '';
  };

  // ── AI parse ──────────────────────────────────────────────────────────
  const runAIParse = async (f: File, type: string) => {
    setParseError('');
    setStage('parsing');
    try {
      const base64   = await fileToBase64(f);
      const mimeType = f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');
      const res = await fetch('/api/bs/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, data: base64, documentType: type }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'AI returned an error');
      const f2: ParsedFields = data.fields ?? {};
      setFields(f2);
      setParseModel(data.model || '');
      setActivitiesText((f2.activities ?? []).join('\n'));
      setStage('confirm');
    } catch (e: any) {
      setParseError(e?.message || 'Unknown error');
      setStage('pick'); // let user save manually
    }
  };

  // ── Confirm & save everything ─────────────────────────────────────────
  const confirmSave = async () => {
    if (!file) return;
    setSaveError('');
    setStage('saving');
    try {
      // 1. Upload file
      const up = await uploadDocumentFile(customerId, file);
      if (!up) throw new Error(isZh ? '文件上传失败，请检查 Storage bucket 是否已创建' : 'Upload failed. Check Storage bucket exists.');

      // 2. Build expiry/issue dates from whichever field the doc type uses
      const expiryDate = fields.expiry_date || fields.passport_expiry_date || fields.emirates_id_expiry_date || fields.visa_expiry_date || undefined;
      const issueDate  = fields.issue_date || undefined;

      // 3. Save document record
      const docPayload: CustomerDocument = {
        customer_id:   customerId,
        document_type: docType,
        document_name: docName.trim() || file.name.replace(/\.[^.]+$/, ''),
        file_url:      up.url,
        storage_path:  up.path,
        issue_date:    issueDate,
        expiry_date:   expiryDate,
        reminder_days: 30,
        uploaded_by:   '',
        notes:         '',
      };
      const savedDoc = await saveCustomerDocument(docPayload);
      if (!savedDoc) throw new Error(isZh ? '文件记录保存失败' : 'Failed to save document record');

      const meta = docMeta(docType);
      const activities = activitiesText.split('\n').map(s => s.trim()).filter(Boolean);

      // 4a. Compliance record
      if (meta.dest === 'compliance') {
        const item: ComplianceItem = {
          customer_id:       customerId,
          document_id:       savedDoc.id,
          compliance_type:   docType,
          title:             fields.trade_name || fields.licensee_name || docName.trim() || docType,
          license_number:    fields.license_number    || undefined,
          licensee_name:     fields.licensee_name     || undefined,
          trade_name:        fields.trade_name        || undefined,
          legal_status:      fields.legal_status      || undefined,
          issuing_authority: fields.issuing_authority || undefined,
          manager_name:      fields.manager_name      || undefined,
          premises_number:   fields.premises_number   || undefined,
          building_name:     fields.building_name     || undefined,
          area_name:         fields.area_name         || undefined,
          activities:        activities.length ? activities : undefined,
          issue_date:        issueDate,
          expiry_date:       expiryDate,
          reminder_days:     30,
          status:            'ACTIVE',
        };
        const saved = await saveComplianceItem(item);
        if (!saved) throw new Error(isZh ? '证照数据保存失败' : 'Failed to save compliance record');
        onCreateComplianceItem?.({ documentId: savedDoc.id!, documentType: docType, documentName: docPayload.document_name, parsed: fields as Record<string, unknown> });
        onComplianceSaved?.();
      }

      // 4b. Person record
      if (meta.dest === 'person') {
        const fullName = fields.full_name?.trim();
        if (!fullName) throw new Error(isZh ? '未识别到姓名，请在「公司人员」Tab 手动添加' : 'Name not detected. Please add manually in Persons tab.');
        const person: CustomerPerson = {
          customer_id:             customerId,
          full_name:               fullName,
          nationality:             fields.nationality             || undefined,
          passport_number:         fields.passport_number         || undefined,
          passport_expiry_date:    fields.passport_expiry_date    || undefined,
          emirates_id_number:      fields.emirates_id_number      || undefined,
          emirates_id_expiry_date: fields.emirates_id_expiry_date || undefined,
          uid_number:              fields.uid_number              || undefined,
          visa_number:             fields.visa_number             || undefined,
          visa_type:               fields.visa_type               || undefined,
          visa_expiry_date:        fields.visa_expiry_date        || undefined,
          date_of_birth:           fields.date_of_birth           || undefined,
          role:                    docType === 'PASSPORT' ? 'Visa Holder' : docType === 'EMIRATES_ID' ? 'Authorized Person' : 'Visa Holder',
          is_legal_representative: false,
          is_manager:              false,
        };
        const saved = await savePerson(person);
        if (!saved) throw new Error(isZh ? '人员数据保存失败' : 'Failed to save person record');
        onCreatePerson?.({ documentId: savedDoc.id!, documentType: docType, documentName: docPayload.document_name, parsed: fields as Record<string, unknown> });
        onPersonSaved?.();
      }

      setDocs(prev => [savedDoc, ...prev]);
      reset();
    } catch (e: any) {
      setSaveError(e?.message || 'Unknown error');
      setStage('confirm');
    }
  };

  // ── Simple save (non-parseable) ────────────────────────────────────────
  const simpleSave = async () => {
    if (!file) { setSaveError(isZh ? '请选择文件' : 'Please select a file'); return; }
    if (!docName.trim()) { setSaveError(isZh ? '请填写文件名称' : 'Please enter a name'); return; }
    setSaveError('');
    setStage('saving');
    try {
      const up = await uploadDocumentFile(customerId, file);
      if (!up) throw new Error(isZh ? '文件上传失败' : 'Upload failed');
      const saved = await saveCustomerDocument({ customer_id: customerId, document_type: docType, document_name: docName.trim(), file_url: up.url, storage_path: up.path, reminder_days: 30, uploaded_by: '', notes: '' });
      if (!saved) throw new Error(isZh ? '记录保存失败' : 'Failed to save record');
      setDocs(prev => [saved, ...prev]);
      reset();
    } catch (e: any) {
      setSaveError(e?.message || 'Unknown error');
      setStage('pick');
    }
  };

  // ── Edit existing doc ──────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editDoc?.id || !editForm) return;
    setSaveError('');
    setStage('saving');
    try {
      await updateCustomerDocument(editDoc.id, editForm);
      setDocs(prev => prev.map(d => d.id === editDoc.id ? { ...d, ...editForm } : d));
      reset();
    } catch (e: any) {
      setSaveError(e?.message || 'Unknown error');
      setStage('edit');
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
    const t = DOC_TYPES.find(d => d.key === key);
    return t ? (isZh ? t.zh : t.en) : key;
  };

  // ── Shared styles ──────────────────────────────────────────────────────
  const inp: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d9e0', fontSize: 13, color: '#17233C', background: 'white', outline: 'none' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 5 };
  const g2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const g3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };

  const errBox = (msg: string) => (
    <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c53030', fontWeight: 600 }}>
      ⚠️ {msg}
    </div>
  );

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">{isZh ? '加载中…' : 'Loading…'}</div>;

  const meta = docMeta(docType);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
            {isZh ? '客户文件' : 'Client Documents'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{docs.length} {isZh ? '份文件' : 'files'}</div>
        </div>
        {stage === 'list'
          ? <button onClick={() => setStage('pick')} className="text-sm font-black px-4 py-2 rounded-xl text-white" style={{ background: NAVY }}>
              + {isZh ? '上传文件' : 'Upload File'}
            </button>
          : <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg font-bold" style={{ background: '#F3F4F6', color: '#6B7280' }}>
              {isZh ? '取消' : 'Cancel'}
            </button>
        }
      </div>

      {/* ════════ STAGE: PICK ════════ */}
      {stage === 'pick' && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="px-5 py-3" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {isZh ? '上传新文件' : 'Upload New Document'}
            </p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* Type + Name */}
            <div style={g2}>
              <div>
                <label style={lbl}>{isZh ? '文件类型' : 'Document Type'}</label>
                <select style={inp} value={docType}
                  onChange={e => { setDocType(e.target.value); setFile(null); setParseError(''); setFileError(''); }}>
                  {DOC_TYPES.map(t => <option key={t.key} value={t.key}>{isZh ? t.zh : t.en}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{isZh ? '文件名称' : 'Document Name'}</label>
                <input style={inp} placeholder={isZh ? '自动填入，可修改' : 'Auto-filled, editable'}
                  value={docName} onChange={e => setDocName(e.target.value)} />
              </div>
            </div>

            {/* Drag & Drop zone */}
            <div>
              <label style={lbl}>
                {isZh ? '选择文件' : 'Select File'}
                {meta.parseable && <span className="ml-2 font-normal text-xs" style={{ color: GOLD }}>✦ {isZh ? '选择后自动AI识别' : 'AI auto-extracts on select'}</span>}
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                onDragEnter={onDragEnter} onDragOver={onDragOver}
                onDragLeave={onDragLeave} onDrop={onDrop}
                className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all select-none"
                style={{
                  borderColor: dragOver ? GOLD : fileError ? '#e53e3e' : '#d1d9e0',
                  background:  dragOver ? `${GOLD}12` : 'white',
                  transform:   dragOver ? 'scale(1.015)' : 'scale(1)',
                  transition:  'all 0.15s ease',
                }}
              >
                {file ? (
                  <div>
                    <div className="text-3xl mb-2">{file.name.endsWith('.pdf') ? '📄' : '🖼️'}</div>
                    <div className="font-bold text-sm" style={{ color: NAVY }}>{file.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB · {isZh ? '点击更换' : 'Click to change'}</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-3">{dragOver ? '📂' : '📁'}</div>
                    <div className="font-bold text-sm" style={{ color: NAVY }}>
                      {isZh ? '点击选择文件，或将文件拖到这里' : 'Click to select a file, or drag and drop here'}
                    </div>
                    <div className="text-xs text-gray-400 mt-1.5">PNG · JPG · PDF</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden"
                accept={ACCEPTED_EXT.join(',')} onChange={onInput} />
            </div>

            {fileError  && errBox(fileError)}
            {parseError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991B1B', fontWeight: 600 }}>
                ⚠️ {isZh ? `AI识别失败：${parseError}` : `AI failed: ${parseError}`}
              </div>
            )}
            {saveError  && errBox(saveError)}

            {/* Non-parseable: show save button once file selected */}
            {!meta.parseable && file && (
              <button onClick={simpleSave} className="w-full py-3 rounded-xl text-white font-black text-sm" style={{ background: NAVY }}>
                {isZh ? '保存文件' : 'Save Document'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ════════ STAGE: PARSING ════════ */}
      {stage === 'parsing' && (
        <div className="mb-5 rounded-2xl p-8 text-center" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: GOLD, borderTopColor: 'transparent' }} />
          <div className="font-black text-sm mb-1" style={{ color: NAVY }}>
            {isZh ? `AI 正在识别${typeLabel(docType)}…` : `AI analyzing ${typeLabel(docType)}…`}
          </div>
          <div className="text-xs text-gray-400">{isZh ? '通常 3–10 秒' : 'Usually 3–10 seconds'}</div>
          {file && <div className="text-xs mt-3 text-gray-500 bg-gray-50 inline-block px-3 py-1 rounded-lg">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
        </div>
      )}

      {/* ════════ STAGE: CONFIRM ════════ */}
      {stage === 'confirm' && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `2px solid ${GOLD}`, background: '#fdfcfa' }}>
          {/* Confirm header */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: `${GOLD}22`, borderBottom: `1px solid ${GOLD}55` }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                ✦ {isZh ? `AI已识别${typeLabel(docType)}，请确认以下信息` : `AI extracted ${typeLabel(docType)} — verify & confirm`}
              </p>
              {parseModel && <p className="text-xs mt-0.5" style={{ color: '#8a6d1c' }}>Model: {parseModel}</p>}
            </div>
            {fields.confidence && (
              <span className="text-xs px-2.5 py-1 rounded-full font-black" style={{
                background: fields.confidence === 'high' ? '#DCFCE7' : fields.confidence === 'medium' ? '#FEF3C7' : '#FEE2E2',
                color:      fields.confidence === 'high' ? '#166534' : fields.confidence === 'medium' ? '#92400E' : '#B91C1C',
              }}>
                {isZh ? `置信度: ${fields.confidence}` : `Confidence: ${fields.confidence}`}
              </span>
            )}
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* ── Compliance fields ── */}
            {meta.dest === 'compliance' && (
              <>
                <div style={g2}>
                  <div>
                    <label style={lbl}>{isZh ? '执照/证书号码' : 'License / Cert No.'}</label>
                    <input style={{ ...inp, background: fields.license_number ? '#F0FDF4' : 'white' }}
                      value={fields.license_number || ''}
                      onChange={e => setFields(v => ({ ...v, license_number: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>{isZh ? '法律形式' : 'Legal Status'}</label>
                    <input style={{ ...inp, background: fields.legal_status ? '#F0FDF4' : 'white' }}
                      placeholder="LLC / FZCO / FZ-LLC…"
                      value={fields.legal_status || ''}
                      onChange={e => setFields(v => ({ ...v, legal_status: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>{isZh ? '持牌人 (Licensee)' : 'Licensee Name'}</label>
                  <input style={{ ...inp, background: fields.licensee_name ? '#F0FDF4' : 'white' }}
                    value={fields.licensee_name || ''}
                    onChange={e => setFields(v => ({ ...v, licensee_name: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>{isZh ? '商业名称 (Trade Name)' : 'Trade Name'}</label>
                  <input style={{ ...inp, background: fields.trade_name ? '#F0FDF4' : 'white' }}
                    value={fields.trade_name || ''}
                    onChange={e => setFields(v => ({ ...v, trade_name: e.target.value }))} />
                </div>
                <div style={g2}>
                  <div>
                    <label style={lbl}>{isZh ? '签发机构' : 'Issuing Authority'}</label>
                    <input style={{ ...inp, background: fields.issuing_authority ? '#F0FDF4' : 'white' }}
                      value={fields.issuing_authority || ''}
                      onChange={e => setFields(v => ({ ...v, issuing_authority: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>{isZh ? '公司经理' : 'Manager'}</label>
                    <input style={{ ...inp, background: fields.manager_name ? '#F0FDF4' : 'white' }}
                      value={fields.manager_name || ''}
                      onChange={e => setFields(v => ({ ...v, manager_name: e.target.value }))} />
                  </div>
                </div>
                <div style={g2}>
                  <div>
                    <label style={lbl}>{isZh ? '签发日期' : 'Issue Date'}</label>
                    <input type="date" style={{ ...inp, background: fields.issue_date ? '#F0FDF4' : 'white' }}
                      value={fields.issue_date || ''}
                      onChange={e => setFields(v => ({ ...v, issue_date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>{isZh ? '到期日期' : 'Expiry Date'}</label>
                    <input type="date" style={{ ...inp, background: fields.expiry_date ? '#F0FDF4' : 'white' }}
                      value={fields.expiry_date || ''}
                      onChange={e => setFields(v => ({ ...v, expiry_date: e.target.value }))} />
                  </div>
                </div>
                <div style={g3}>
                  <div>
                    <label style={lbl}>{isZh ? '单位编号' : 'Premises No.'}</label>
                    <input style={{ ...inp, background: fields.premises_number ? '#F0FDF4' : 'white' }}
                      value={fields.premises_number || ''}
                      onChange={e => setFields(v => ({ ...v, premises_number: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>{isZh ? '楼名' : 'Building'}</label>
                    <input style={{ ...inp, background: fields.building_name ? '#F0FDF4' : 'white' }}
                      value={fields.building_name || ''}
                      onChange={e => setFields(v => ({ ...v, building_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>{isZh ? '区域' : 'Area'}</label>
                    <input style={{ ...inp, background: fields.area_name ? '#F0FDF4' : 'white' }}
                      value={fields.area_name || ''}
                      onChange={e => setFields(v => ({ ...v, area_name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>{isZh ? '经营范围（每行一条）' : 'Business Activities (one per line)'}</label>
                  <textarea
                    style={{ ...inp, height: 88, resize: 'vertical', fontFamily: 'inherit', background: activitiesText ? '#F0FDF4' : 'white' }}
                    value={activitiesText}
                    onChange={e => setActivitiesText(e.target.value)}
                    placeholder={isZh ? '每行一条经营范围…' : 'One activity per line…'}
                  />
                </div>
              </>
            )}

            {/* ── Person fields ── */}
            {meta.dest === 'person' && (
              <>
                <div style={g2}>
                  <div>
                    <label style={lbl}>{isZh ? '姓名' : 'Full Name'} <span style={{ color: '#e53e3e' }}>*</span></label>
                    <input style={{ ...inp, background: fields.full_name ? '#F0FDF4' : 'white' }}
                      value={fields.full_name || ''}
                      onChange={e => setFields(v => ({ ...v, full_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>{isZh ? '国籍' : 'Nationality'}</label>
                    <input style={{ ...inp, background: fields.nationality ? '#F0FDF4' : 'white' }}
                      value={fields.nationality || ''}
                      onChange={e => setFields(v => ({ ...v, nationality: e.target.value }))} />
                  </div>
                </div>
                {docType === 'PASSPORT' && (
                  <div style={g2}>
                    <div>
                      <label style={lbl}>{isZh ? '护照号码' : 'Passport No.'}</label>
                      <input style={{ ...inp, background: fields.passport_number ? '#F0FDF4' : 'white' }}
                        value={fields.passport_number || ''}
                        onChange={e => setFields(v => ({ ...v, passport_number: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>{isZh ? '护照到期日' : 'Passport Expiry'}</label>
                      <input type="date" style={{ ...inp, background: fields.passport_expiry_date ? '#F0FDF4' : 'white' }}
                        value={fields.passport_expiry_date || ''}
                        onChange={e => setFields(v => ({ ...v, passport_expiry_date: e.target.value }))} />
                    </div>
                  </div>
                )}
                {docType === 'EMIRATES_ID' && (
                  <div style={g2}>
                    <div>
                      <label style={lbl}>Emirates ID No.</label>
                      <input style={{ ...inp, background: fields.emirates_id_number ? '#F0FDF4' : 'white' }}
                        value={fields.emirates_id_number || ''}
                        onChange={e => setFields(v => ({ ...v, emirates_id_number: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>{isZh ? 'EID 到期日' : 'EID Expiry'}</label>
                      <input type="date" style={{ ...inp, background: fields.emirates_id_expiry_date ? '#F0FDF4' : 'white' }}
                        value={fields.emirates_id_expiry_date || ''}
                        onChange={e => setFields(v => ({ ...v, emirates_id_expiry_date: e.target.value }))} />
                    </div>
                  </div>
                )}
                {(docType === 'WORK_VISA' || docType === 'INVESTOR_VISA' || docType === 'FAMILY_VISA') && (
                  <div style={g3}>
                    <div>
                      <label style={lbl}>{isZh ? '签证号' : 'Visa No.'}</label>
                      <input style={{ ...inp, background: fields.visa_number ? '#F0FDF4' : 'white' }}
                        value={fields.visa_number || ''}
                        onChange={e => setFields(v => ({ ...v, visa_number: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>{isZh ? '签证类型' : 'Visa Type'}</label>
                      <input style={{ ...inp, background: fields.visa_type ? '#F0FDF4' : 'white' }}
                        value={fields.visa_type || ''}
                        onChange={e => setFields(v => ({ ...v, visa_type: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>{isZh ? '签证到期日' : 'Visa Expiry'}</label>
                      <input type="date" style={{ ...inp, background: fields.visa_expiry_date ? '#F0FDF4' : 'white' }}
                        value={fields.visa_expiry_date || ''}
                        onChange={e => setFields(v => ({ ...v, visa_expiry_date: e.target.value }))} />
                    </div>
                  </div>
                )}
                <div style={g2}>
                  <div>
                    <label style={lbl}>{isZh ? '出生日期' : 'Date of Birth'}</label>
                    <input type="date" style={{ ...inp, background: fields.date_of_birth ? '#F0FDF4' : 'white' }}
                      value={fields.date_of_birth || ''}
                      onChange={e => setFields(v => ({ ...v, date_of_birth: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>UID No.</label>
                    <input style={{ ...inp, background: fields.uid_number ? '#F0FDF4' : 'white' }}
                      value={fields.uid_number || ''}
                      onChange={e => setFields(v => ({ ...v, uid_number: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {/* Doc label */}
            <div>
              <label style={lbl}>{isZh ? '文件标签名称' : 'Document Label'}</label>
              <input style={inp} value={docName} onChange={e => setDocName(e.target.value)} />
            </div>

            {saveError && errBox(saveError)}

            {/* Buttons */}
            <div className="flex gap-3">
              <button onClick={confirmSave}
                className="font-black text-sm py-3 rounded-xl text-white"
                style={{ flex: 2, background: NAVY }}>
                ✓ {isZh ? '确认并保存' : 'Confirm & Save'}
              </button>
              <button
                onClick={() => { if (file) runAIParse(file, docType); }}
                className="font-bold text-sm py-3 rounded-xl"
                style={{ flex: 1, background: `${GOLD}20`, color: '#8a6d1c', border: `1px solid ${GOLD}55` }}>
                {isZh ? '重新识别' : 'Re-analyze'}
              </button>
              <button onClick={reset}
                className="font-bold text-sm py-3 px-4 rounded-xl"
                style={{ background: '#F3F4F6', color: '#6B7280' }}>
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ STAGE: SAVING ════════ */}
      {stage === 'saving' && (
        <div className="mb-5 rounded-2xl p-8 text-center" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: NAVY, borderTopColor: 'transparent' }} />
          <div className="font-black text-sm" style={{ color: NAVY }}>
            {isZh ? '正在上传文件并保存数据…' : 'Uploading file and saving records…'}
          </div>
        </div>
      )}

      {/* ════════ STAGE: EDIT ════════ */}
      {stage === 'edit' && editForm && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {isZh ? '编辑文件资料' : 'Edit Document'}
            </p>
            <button onClick={reset} style={{ color: '#8a9ab0', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div style={g2}>
              <div>
                <label style={lbl}>{isZh ? '文件类型' : 'Type'}</label>
                <select style={inp} value={editForm.document_type}
                  onChange={e => setEditForm(v => v ? { ...v, document_type: e.target.value } : v)}>
                  {DOC_TYPES.map(t => <option key={t.key} value={t.key}>{isZh ? t.zh : t.en}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{isZh ? '文件名称' : 'Name'}</label>
                <input style={inp} value={editForm.document_name}
                  onChange={e => setEditForm(v => v ? { ...v, document_name: e.target.value } : v)} />
              </div>
            </div>
            <div style={g2}>
              <div>
                <label style={lbl}>{isZh ? '签发日期' : 'Issue Date'}</label>
                <input type="date" style={inp} value={editForm.issue_date || ''}
                  onChange={e => setEditForm(v => v ? { ...v, issue_date: e.target.value } : v)} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '到期日期' : 'Expiry Date'}</label>
                <input type="date" style={inp} value={editForm.expiry_date || ''}
                  onChange={e => setEditForm(v => v ? { ...v, expiry_date: e.target.value } : v)} />
              </div>
            </div>
            <div style={g2}>
              <div>
                <label style={lbl}>{isZh ? '上传人' : 'By'}</label>
                <input style={inp} value={editForm.uploaded_by || ''}
                  onChange={e => setEditForm(v => v ? { ...v, uploaded_by: e.target.value } : v)} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '备注' : 'Notes'}</label>
                <input style={inp} value={editForm.notes || ''}
                  onChange={e => setEditForm(v => v ? { ...v, notes: e.target.value } : v)} />
              </div>
            </div>
            {saveError && errBox(saveError)}
            <div className="flex gap-3">
              <button onClick={saveEdit} className="flex-1 py-3 rounded-xl text-white font-black text-sm" style={{ background: NAVY }}>
                {isZh ? '保存修改' : 'Save Changes'}
              </button>
              <button onClick={reset} className="px-5 py-3 rounded-xl font-bold text-sm" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ DOCUMENT LIST ════════ */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">📎</div>
          <div className="text-sm text-gray-500 font-medium">{isZh ? '暂无客户文件' : 'No documents uploaded yet'}</div>
          <div className="text-xs text-gray-400 mt-1">{isZh ? '上传营业执照、合同、护照等重要文件' : 'Upload trade licenses, contracts, passports and more'}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const lvl  = expiryLevel(doc.expiry_date);
            const s    = BADGE[lvl];
            const days = daysUntil(doc.expiry_date);
            const hasFile = !!(doc.file_url || doc.storage_path);
            return (
              <div key={doc.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e8e0d0', background: 'white' }}>
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${NAVY}10` }}>
                    {doc.document_type?.includes('PASSPORT') ? '🛂' : doc.document_type?.includes('VAT') || doc.document_type?.includes('TAX') ? '🧾' : doc.document_type === 'CONTRACT' ? '📋' : doc.document_type?.includes('VISA') ? '✈️' : doc.document_type === 'EMIRATES_ID' ? '🪪' : '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm" style={{ color: NAVY }}>{doc.document_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${NAVY}10`, color: NAVY }}>{typeLabel(doc.document_type || '')}</span>
                      {doc.expiry_date && lvl !== 'none' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: s.bg, color: s.text }}>
                          {days !== null && days < 0 ? (isZh ? `逾期${Math.abs(days)}天` : `${Math.abs(days)}d overdue`) : days !== null ? (isZh ? `还剩${days}天` : `${days}d`) : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                      {doc.issue_date  && <span>{isZh ? '签发' : 'Issued'}: {doc.issue_date}</span>}
                      {doc.expiry_date && <span>{isZh ? '到期' : 'Expires'}: {doc.expiry_date}</span>}
                      {doc.uploaded_by && <span>{isZh ? '上传人' : 'By'}: {doc.uploaded_by}</span>}
                      {doc.notes       && <span className="truncate max-w-[120px]">{doc.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {hasFile && (
                      <>
                        <button onClick={() => handlePreview(doc)} className="text-xs px-2.5 py-1.5 rounded-lg font-bold" style={{ background: `${GOLD}20`, color: '#8a6d1c' }}>
                          {isZh ? '预览' : 'View'}
                        </button>
                        <a href={doc.file_url || '#'} target="_blank" rel="noreferrer"
                          onClick={async e => { if (doc.storage_path && !doc.file_url) { e.preventDefault(); const url = await getSignedUrl(doc.storage_path); if (url) window.open(url, '_blank'); } }}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-bold" style={{ background: `${NAVY}10`, color: NAVY, textDecoration: 'none' }}>
                          {isZh ? '下载' : 'DL'}
                        </a>
                      </>
                    )}
                    <button onClick={() => { setEditDoc(doc); setEditForm({ ...doc }); setSaveError(''); setStage('edit'); }}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      {isZh ? '编辑' : 'Edit'}
                    </button>
                    <button onClick={() => handleDelete(doc)} className="text-xs px-2.5 py-1.5 rounded-lg font-bold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
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
