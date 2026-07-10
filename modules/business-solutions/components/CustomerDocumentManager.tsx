import React, { useState, useEffect, useRef } from 'react';
import type { BSLang } from '../types';
import type { CustomerDocument } from '../lib/bsCloud';
import {
  listCustomerDocuments, saveCustomerDocument, updateCustomerDocument,
  deleteCustomerDocument, uploadDocumentFile, getSignedUrl,
} from '../lib/bsCloud';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

const DOC_TYPES_ZH = [
  '营业执照', '公司注册证书', 'MOA / Memorandum', '股东证件',
  '护照', 'Emirates ID', 'VAT Certificate', 'Corporate Tax Certificate',
  '银行资料', '合同', '授权书', '其他',
];
const DOC_TYPES_EN = [
  'Trade License', 'Certificate of Incorporation', 'MOA / Memorandum', 'Shareholder ID',
  'Passport', 'Emirates ID', 'VAT Certificate', 'Corporate Tax Certificate',
  'Bank Documents', 'Contract', 'Power of Attorney', 'Other',
];

const REMINDER_OPTIONS = [30, 60, 90];

interface Props {
  customerId: string;
  customerName: string;
  lang: BSLang;
}

function getExpiryStatus(expiryDate?: string): 'expired' | 'warning' | 'soon' | 'ok' | 'none' {
  if (!expiryDate) return 'none';
  const now = new Date();
  const exp = new Date(expiryDate);
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'warning';
  if (diffDays <= 60) return 'soon';
  return 'ok';
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; labelEn: string }> = {
  expired: { bg: '#FEE2E2', text: '#B91C1C', label: '已过期', labelEn: 'Expired' },
  warning: { bg: '#FED7AA', text: '#C2410C', label: '30天内到期', labelEn: 'Expires soon' },
  soon:    { bg: '#FEF9C3', text: '#92400E', label: '60天内到期', labelEn: 'Expiring' },
  ok:      { bg: '#DCFCE7', text: '#166534', label: '有效', labelEn: 'Valid' },
  none:    { bg: '#F3F4F6', text: '#6B7280', label: '无到期日', labelEn: 'No expiry' },
};

export function CustomerDocumentManager({ customerId, customerName, lang }: Props) {
  const isZh = lang === 'zh';
  const docTypes = isZh ? DOC_TYPES_ZH : DOC_TYPES_EN;

  const [docs, setDocs] = useState<CustomerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<CustomerDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const emptyForm = (): CustomerDocument => ({
    customer_id: customerId,
    document_type: docTypes[0],
    document_name: '',
    issue_date: '',
    expiry_date: '',
    reminder_days: 30,
    notes: '',
    uploaded_by: '',
  });

  const [form, setForm] = useState<CustomerDocument>(emptyForm());
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    load();
  }, [customerId]);

  const load = async () => {
    setLoading(true);
    const data = await listCustomerDocuments(customerId);
    setDocs(data);
    setLoading(false);
  };

  const openAddForm = () => {
    setEditingDoc(null);
    setForm(emptyForm());
    setPendingFile(null);
    setError('');
    setShowForm(true);
  };

  const openEditForm = (doc: CustomerDocument) => {
    setEditingDoc(doc);
    setForm({ ...doc });
    setPendingFile(null);
    setError('');
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    if (!form.document_name) {
      setForm(v => ({ ...v, document_name: f.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const handleSave = async () => {
    if (!form.document_name.trim()) {
      setError(isZh ? '请填写文件名称' : 'Please enter a document name');
      return;
    }
    setError('');
    setSaving(true);

    let fileUrl = form.file_url;
    let storagePath = form.storage_path;

    if (pendingFile) {
      setUploading(true);
      const result = await uploadDocumentFile(customerId, pendingFile);
      setUploading(false);
      if (!result) {
        setError(isZh ? '文件上传失败，请检查 Storage Bucket 是否已创建' : 'Upload failed. Please ensure the storage bucket exists.');
        setSaving(false);
        return;
      }
      fileUrl = result.url;
      storagePath = result.path;
    }

    const payload: CustomerDocument = {
      ...form,
      file_url: fileUrl,
      storage_path: storagePath,
      document_name: form.document_name.trim(),
      issue_date: form.issue_date || undefined,
      expiry_date: form.expiry_date || undefined,
    };

    if (editingDoc?.id) {
      const ok = await updateCustomerDocument(editingDoc.id, payload);
      if (ok) {
        setDocs(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...payload } : d));
      }
    } else {
      const saved = await saveCustomerDocument(payload);
      if (saved) setDocs(prev => [saved, ...prev]);
    }

    setSaving(false);
    setShowForm(false);
    setPendingFile(null);
  };

  const handleDelete = async (doc: CustomerDocument) => {
    const confirm = window.confirm(
      isZh
        ? `确定删除文件「${doc.document_name}」？此操作不可撤销。`
        : `Delete "${doc.document_name}"? This cannot be undone.`
    );
    if (!confirm) return;
    if (doc.id) await deleteCustomerDocument(doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const handlePreview = async (doc: CustomerDocument) => {
    let url = doc.file_url;
    if (!url && doc.storage_path) {
      url = await getSignedUrl(doc.storage_path) || undefined;
    }
    if (url) window.open(url, '_blank');
    else alert(isZh ? '文件链接不可用' : 'File URL not available');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        {isZh ? '加载中…' : 'Loading…'}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
            {isZh ? '客户文件' : 'Client Documents'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {docs.length} {isZh ? '份文件' : 'files'}
          </div>
        </div>
        <button
          onClick={openAddForm}
          className="text-sm font-black px-4 py-2 rounded-xl text-white"
          style={{ background: NAVY }}
        >
          + {isZh ? '上传文件' : 'Upload File'}
        </button>
      </div>

      {/* Expiry summary */}
      {docs.some(d => ['expired', 'warning'].includes(getExpiryStatus(d.expiry_date))) && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <span className="font-bold text-red-700">
            {isZh ? '⚠️ 注意：有文件即将到期或已过期' : '⚠️ Alert: Some documents are expiring or expired'}
          </span>
        </div>
      )}

      {/* Upload / Edit Form */}
      {showForm && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="px-5 py-3" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {editingDoc ? (isZh ? '编辑文件资料' : 'Edit Document') : (isZh ? '上传新文件' : 'Upload New Document')}
            </p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* File picker */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                {isZh ? '选择文件' : 'Select File'}
                {!editingDoc && <span style={{ color: '#e53e3e', marginLeft: 4 }}>*</span>}
              </label>
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:border-yellow-400 transition-colors"
                style={{ borderColor: pendingFile ? GOLD : '#d1d9e0' }}
                onClick={() => fileRef.current?.click()}
              >
                {pendingFile ? (
                  <div>
                    <div className="text-sm font-bold" style={{ color: NAVY }}>{pendingFile.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(pendingFile.size / 1024).toFixed(0)} KB · {isZh ? '点击更换' : 'Click to replace'}
                    </div>
                  </div>
                ) : editingDoc?.file_url ? (
                  <div className="text-xs text-gray-500">
                    {isZh ? '已有文件，点击替换（或留空保留原文件）' : 'File exists. Click to replace, or leave empty to keep current.'}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    {isZh ? '点击选择文件（PDF、图片、Word 等）' : 'Click to select file (PDF, image, Word, etc.)'}
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange}
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
            </div>

            {/* Doc type + name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '文件类型' : 'Document Type'}<span style={{ color: '#e53e3e', marginLeft: 4 }}>*</span>
                </label>
                <select
                  style={{ display: 'block', width: '100%', padding: '11px 14px', borderRadius: 10, border: `1.5px solid #b0bec5`, fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  value={form.document_type}
                  onChange={e => setForm(v => ({ ...v, document_type: e.target.value }))}
                >
                  {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '文件名称' : 'Document Name'}<span style={{ color: '#e53e3e', marginLeft: 4 }}>*</span>
                </label>
                <input
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${error && !form.document_name ? '#e53e3e' : '#b0bec5'}`, fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  placeholder={isZh ? '如：营业执照 2024' : 'e.g. Trade License 2024'}
                  value={form.document_name}
                  onChange={e => setForm(v => ({ ...v, document_name: e.target.value }))}
                />
              </div>
            </div>

            {/* Dates + reminder */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '签发日期' : 'Issue Date'}
                </label>
                <input
                  type="date"
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  value={form.issue_date || ''}
                  onChange={e => setForm(v => ({ ...v, issue_date: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '到期日期' : 'Expiry Date'}
                </label>
                <input
                  type="date"
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  value={form.expiry_date || ''}
                  onChange={e => setForm(v => ({ ...v, expiry_date: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '提醒天数' : 'Reminder (days)'}
                </label>
                <select
                  style={{ display: 'block', width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  value={form.reminder_days || 30}
                  onChange={e => setForm(v => ({ ...v, reminder_days: Number(e.target.value) }))}
                >
                  {REMINDER_OPTIONS.map(n => <option key={n} value={n}>{n} {isZh ? '天' : 'days'}</option>)}
                </select>
              </div>
            </div>

            {/* Notes + uploaded_by */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '备注' : 'Notes'}
                </label>
                <input
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  placeholder={isZh ? '可填写文件说明…' : 'Optional notes…'}
                  value={form.notes || ''}
                  onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                  {isZh ? '上传人' : 'Uploaded By'}
                </label>
                <input
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                  placeholder="Chris / Lili"
                  value={form.uploaded_by || ''}
                  onChange={e => setForm(v => ({ ...v, uploaded_by: e.target.value }))}
                />
              </div>
            </div>

            {error && (
              <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#c53030', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || uploading}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 15, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: NAVY, color: 'white' }}
              >
                {uploading ? (isZh ? '上传中…' : 'Uploading…') : saving ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存文件' : 'Save Document')}
              </button>
              <button
                onClick={() => { setShowForm(false); setPendingFile(null); setError(''); }}
                style={{ padding: '13px 20px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', border: `1.5px solid #d1d9e0`, background: 'white', color: '#5a6a82' }}
              >
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
          <div className="text-sm text-gray-500 font-medium">
            {isZh ? '暂无客户文件' : 'No documents uploaded yet'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {isZh ? '点击「上传文件」添加营业执照、合同等重要文件' : 'Upload licenses, contracts, and other important documents'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const status = getExpiryStatus(doc.expiry_date);
            const ss = STATUS_STYLE[status];
            const hasFile = !!(doc.file_url || doc.storage_path);
            return (
              <div
                key={doc.id}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid #e8e0d0', background: 'white' }}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* File icon */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: `${NAVY}10` }}>
                    {doc.document_type.includes('Passport') || doc.document_type.includes('护照') ? '🛂'
                      : doc.document_type.includes('VAT') || doc.document_type.includes('Tax') ? '🧾'
                      : doc.document_type.includes('合同') || doc.document_type.includes('Contract') ? '📋'
                      : doc.document_type.includes('MOA') ? '📜'
                      : '📄'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm" style={{ color: NAVY }}>{doc.document_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${NAVY}10`, color: NAVY }}>
                        {doc.document_type}
                      </span>
                      {doc.expiry_date && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: ss.bg, color: ss.text }}>
                          {isZh ? ss.label : ss.labelEn}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                      {doc.issue_date && <span>{isZh ? '签发' : 'Issued'}: {doc.issue_date}</span>}
                      {doc.expiry_date && <span>{isZh ? '到期' : 'Expires'}: {doc.expiry_date}</span>}
                      {doc.uploaded_by && <span>{isZh ? '上传人' : 'By'}: {doc.uploaded_by}</span>}
                    </div>
                    {doc.notes && (
                      <div className="text-xs text-gray-400 mt-1 truncate">{doc.notes}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    {hasFile && (
                      <>
                        <button
                          onClick={() => handlePreview(doc)}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all hover:opacity-80"
                          style={{ background: `${GOLD}20`, color: '#8a6d1c' }}
                          title={isZh ? '预览' : 'Preview'}
                        >
                          {isZh ? '预览' : 'View'}
                        </button>
                        <a
                          href={doc.file_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          onClick={async e => {
                            if (doc.storage_path && !doc.file_url) {
                              e.preventDefault();
                              const url = await getSignedUrl(doc.storage_path);
                              if (url) window.open(url, '_blank');
                            }
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all hover:opacity-80"
                          style={{ background: `${NAVY}10`, color: NAVY, textDecoration: 'none' }}
                          title={isZh ? '下载' : 'Download'}
                        >
                          {isZh ? '下载' : 'Download'}
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => openEditForm(doc)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all hover:opacity-80"
                      style={{ background: '#EFF6FF', color: '#2563EB' }}
                    >
                      {isZh ? '编辑' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all hover:opacity-80"
                      style={{ background: '#FEE2E2', color: '#B91C1C' }}
                    >
                      {isZh ? '删除' : 'Delete'}
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
