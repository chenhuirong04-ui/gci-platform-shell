import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '@gci/i18n';
import type { Supplier, SupplierDocument, DocumentType, DocumentVerificationStatus } from '../types';
import {
  createDocument, deleteDocument, deleteStorageObject, listDocuments, updateDocument,
  getDocumentUrl, resolveStorageBucket, uploadSupplierFile,
} from '../lib/documentsCloud';
import { getDocStatusLabel, getDocTypeLabel } from '../lib/labelMaps';
import TradeLicenseUploader from './TradeLicenseUploader';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const BORDER = '#e8e0d0';
const T2 = '#334155';
const T3 = '#94a3b8';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#0F172A', background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 };

const DOC_TYPES: DocumentType[] = [
  '营业执照','公司注册文件','VAT文件','税务文件','公司简介',
  '产品目录','产品规格书','检测报告','报价原件','合同','NDA',
  '银行资料','工厂照片','审厂报告','认证证书','其他',
];

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const ALLOWED_EXT = ['.pdf','.xls','.xlsx','.doc','.docx','.jpg','.jpeg','.png'];
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

const VSTATUS_COLOR: Record<DocumentVerificationStatus, string> = {
  unverified: '#94a3b8', verified: '#16a34a', rejected: '#dc2626', pending_reupload: '#d97706',
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

const EMPTY = (sid: string): Omit<SupplierDocument, 'id'> => ({
  supplier_id: sid, document_type: '营业执照', document_name: '',
  file_url: '', document_number: '', issuing_authority: '',
  issue_date: '', expire_date: '', verification_status: 'unverified', notes: '',
});

interface Props { supplierId: string; supplier?: Supplier; }

export default function DocumentCenter({ supplierId, supplier }: Props) {
  const { lang, dict } = useI18n();
  const t = dict.suppliers.documents;
  const c0 = dict.suppliers.common;
  const [docs, setDocs] = useState<SupplierDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<SupplierDocument> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showLicenseUploader, setShowLicenseUploader] = useState(false);

  // File picker state (reset each time dialog opens)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stageLabel, setStageLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => { setLoading(true); setDocs(await listDocuments(supplierId)); setLoading(false); };
  useEffect(() => { load(); }, [supplierId]);

  const openEdit = (doc: Partial<SupplierDocument>) => {
    setEdit(doc);
    setSelectedFile(null);
    setSaveErr(null);
    setUploading(false);
    setStageLabel('');
  };

  const handleView = async (doc: SupplierDocument) => {
    if (!doc.id) return;
    if (signedUrls[doc.id]) { window.open(signedUrls[doc.id], '_blank'); return; }
    const url = await getDocumentUrl(doc);
    if (url) { setSignedUrls(m => ({ ...m, [doc.id!]: url })); window.open(url, '_blank'); }
  };

  // ── File selection ───────────────────────────────────────────────────────────
  const applyFile = (f: File) => {
    if (!ALLOWED_TYPES.includes(f.type) && !ALLOWED_EXT.some(e => f.name.toLowerCase().endsWith(e))) {
      setSaveErr(t.errUnsupportedType(f.name));
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setSaveErr(t.errFileTooLarge(f.name, (f.size / 1024 / 1024).toFixed(1)));
      return;
    }
    setSelectedFile(f);
    setSaveErr(null);
    // Auto-fill document_name from filename (strip extension)
    if (!edit?.document_name?.trim()) {
      const name = f.name.replace(/\.[^.]+$/, '');
      setEdit(v => ({ ...v!, document_name: name }));
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) applyFile(f);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!edit) return;
    const hasFile = !!selectedFile;
    const hasUrl = !!edit.file_url?.trim();
    const hasStoragePath = !!edit.storage_path; // editing existing record

    if (!hasFile && !hasUrl && !hasStoragePath) {
      setSaveErr(t.errNoFile);
      return;
    }
    if (!edit.document_name?.trim()) {
      setSaveErr(t.errNoName);
      return;
    }

    const uploadedNewFile = !!selectedFile;
    const isCatalog = (edit.document_type ?? '其他') === '产品目录';

    setSaving(true); setSaveErr(null);
    try {
      let storagePatch: Partial<SupplierDocument> = {};

      if (selectedFile) {
        setUploading(true);
        const result = await uploadSupplierFile(supplierId, selectedFile, edit.document_type ?? '其他', stage => {
          setStageLabel(stage === 'authorizing' ? t.stagePreparing : t.stageUploading);
        });
        setUploading(false);
        storagePatch = {
          storage_bucket: result.bucket,
          storage_path: result.path,
          file_size: selectedFile.size,
          mime_type: selectedFile.type || 'application/octet-stream',
        };
      }

      setStageLabel(t.stageSaving);
      const bucket = resolveStorageBucket(edit.document_type ?? '其他');
      const payload = { ...EMPTY(supplierId), ...edit, supplier_id: supplierId, storage_bucket: bucket, ...storagePatch };

      try {
        if (edit.id) {
          await updateDocument(edit.id, { ...edit, ...storagePatch });
        } else {
          await createDocument(payload);
        }
      } catch (dbErr: any) {
        if (storagePatch.storage_bucket && storagePatch.storage_path) {
          await deleteStorageObject(storagePatch.storage_bucket, storagePatch.storage_path);
        }
        throw new Error(dbErr?.message || t.errSaveFailed);
      }

      setEdit(null);
      setSelectedFile(null);
      await load();

      if (uploadedNewFile) {
        setSuccessMsg(isCatalog
          ? (lang === 'zh' ? '产品目录上传成功' : 'Product catalogue uploaded successfully')
          : (lang === 'zh' ? '文件上传成功' : 'File uploaded successfully'));
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (e: any) {
      setSaveErr(e?.message ?? t.errSaveFailed);
    } finally {
      setSaving(false);
      setUploading(false);
      setStageLabel('');
    }
  };

  // Group by document_type
  const groups = DOC_TYPES.reduce((acc, dt) => {
    const items = docs.filter(d => d.document_type === dt);
    if (items.length) acc[dt] = items;
    return acc;
  }, {} as Record<string, SupplierDocument[]>);

  // Expiry check
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  const expiryColor = (d: string | undefined) => !d ? '' : d < today ? '#dc2626' : d < soonStr ? '#d97706' : '';

  if (showLicenseUploader && supplier) {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>{t.uploadLicenseTitle}</div>
        <TradeLicenseUploader
          supplier={supplier}
          onSaved={() => { setShowLicenseUploader(false); load(); }}
          onCancel={() => setShowLicenseUploader(false)}
        />
      </div>
    );
  }

  const canSave = !saving && (!!selectedFile || !!edit?.file_url?.trim() || !!edit?.storage_path);
  const saveLabel = uploading || saving ? c0.saving : c0.save;

  return (
    <div>
      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 700, color: '#166534' }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Primary upload actions */}
      <div style={{ background: '#fffbf0', border: `1.5px dashed ${GOLD}`, borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.quickUpload}</span>
        <button
          onClick={() => setShowLicenseUploader(true)}
          style={{ padding: '9px 18px', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {t.uploadLicenseBtn}
        </button>
        <button
          onClick={() => openEdit({ ...EMPTY(supplierId), document_type: '产品目录' as DocumentType })}
          style={{ padding: '9px 18px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}
        >
          {t.uploadOtherBtn}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>{t.count(docs.length)}</span>
        <button onClick={() => openEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t.add}</button>
      </div>

      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{c0.loading}</div>
       : docs.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{t.empty}</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(groups).map(([type, items]) => (
            <div key={type}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{getDocTypeLabel(type, lang)}</div>
              {items.map(doc => {
                const ec = expiryColor(doc.expire_date);
                return (
                  <div key={doc.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: NAVY, fontSize: 13 }}>{doc.document_name}</span>
                      {doc.document_number && <span style={{ fontSize: 11, color: T3, marginLeft: 8 }}>#{doc.document_number}</span>}
                      {doc.file_size && <span style={{ fontSize: 10, color: T3, marginLeft: 8 }}>{formatBytes(doc.file_size)}</span>}
                      <div style={{ fontSize: 11, color: T3, marginTop: 3, display: 'flex', gap: 10 }}>
                        {doc.storage_path && doc.created_at && (
                          <span>{t.uploadedAt(new Date(doc.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }))}</span>
                        )}
                        {doc.issue_date && <span>{t.issued(doc.issue_date)}</span>}
                        {doc.expire_date && <span style={{ color: ec || T3, fontWeight: ec ? 700 : undefined }}>{t.expires(doc.expire_date)}{ec && ' ⚠'}</span>}
                        {doc.storage_path && <span style={{ color: '#16a34a' }}>{t.uploaded}</span>}
                        <span style={{ color: VSTATUS_COLOR[doc.verification_status as DocumentVerificationStatus] ?? T3 }}>
                          {getDocStatusLabel(doc.verification_status ?? 'unverified', lang)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(doc.storage_path || doc.file_url) && (
                        <button onClick={() => handleView(doc)} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{t.viewBtn}</button>
                      )}
                      <button onClick={() => openEdit({ ...doc })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.edit}</button>
                      {deleteId === doc.id
                        ? <><button onClick={async () => { await deleteDocument(doc.id!); setDeleteId(null); load(); }} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.confirm}</button>
                            <button onClick={() => setDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.cancel}</button></>
                        : <button onClick={() => setDeleteId(doc.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.delete}</button>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ─────────────────────────────────────────────────── */}
      {edit && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{edit.id ? t.modalEdit : t.modalNew}</div>

            {/* 1. Document type */}
            <F label={t.fType}>
              <select style={INP} value={edit.document_type ?? '营业执照'}
                onChange={e => setEdit(v => ({ ...v!, document_type: e.target.value as DocumentType }))}>
                {DOC_TYPES.map(dt => <option key={dt} value={dt}>{getDocTypeLabel(dt, lang)}</option>)}
              </select>
            </F>

            {/* 2. Select local file */}
            <div>
              <label style={LBL}>{t.fSelectFile} {!edit.storage_path && <span style={{ color: '#dc2626' }}>{t.fSelectFileRequired}</span>}</label>

              {/* Existing file indicator */}
              {edit.storage_path && !selectedFile && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{t.hasExisting}</span>
                  <span style={{ color: T3 }}>{t.hasExistingSub}</span>
                </div>
              )}

              {/* Drag-drop / file picker zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? GOLD : '#b0bec5'}`,
                  borderRadius: 10,
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? '#fffbf0' : '#f8fafc',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                {selectedFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 24 }}>📎</span>
                    <span style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>{selectedFile.name}</span>
                    <span style={{ fontSize: 11, color: T3 }}>{formatBytes(selectedFile.size)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedFile(null); setSaveErr(null); }}
                      style={{ marginTop: 6, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {t.dropRemove}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 28, opacity: 0.5 }}>📂</span>
                    <span style={{ fontSize: 13, color: T2, fontWeight: 600 }}>{t.dropPrompt}</span>
                    <span style={{ fontSize: 11, color: T3 }}>{t.dropSupport}</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXT.join(',')}
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) applyFile(f); e.target.value = ''; }}
              />

              {/* Upload progress indicator */}
              {stageLabel && (
                <div style={{ marginTop: 8, background: '#f0f4ff', border: '1px solid #c7d7ff', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: NAVY, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #c7d7ff', borderTopColor: NAVY, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  {stageLabel}
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
            </div>

            {/* 3. File name */}
            <F label={t.fName}>
              <input style={INP} value={edit.document_name ?? ''}
                onChange={e => setEdit(v => ({ ...v!, document_name: e.target.value }))}
                placeholder={t.fNamePlaceholder} />
            </F>

            {/* 4. External link (secondary, legacy compat) */}
            <div>
              <label style={{ ...LBL, color: T3 }}>{t.fExternalUrl}</label>
              <input style={{ ...INP, border: '1.5px solid #e2e8f0', color: T3 }}
                value={edit.file_url ?? ''}
                onChange={e => setEdit(v => ({ ...v!, file_url: e.target.value }))}
                placeholder="https://..." />
            </div>

            {/* 5. Document details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <F label={t.fNumber}><input style={INP} value={edit.document_number ?? ''} onChange={e => setEdit(v => ({ ...v!, document_number: e.target.value }))} /></F>
              <F label={t.fIssuingAuthority}><input style={INP} value={edit.issuing_authority ?? ''} onChange={e => setEdit(v => ({ ...v!, issuing_authority: e.target.value }))} /></F>
              <F label={t.fIssueDate}><input style={INP} type="date" value={edit.issue_date ?? ''} onChange={e => setEdit(v => ({ ...v!, issue_date: e.target.value }))} /></F>
              <F label={t.fExpireDate}><input style={INP} type="date" value={edit.expire_date ?? ''} onChange={e => setEdit(v => ({ ...v!, expire_date: e.target.value }))} /></F>
            </div>

            {/* 6. Verification status */}
            <F label={t.fVerification}>
              <select style={INP} value={edit.verification_status ?? 'unverified'}
                onChange={e => setEdit(v => ({ ...v!, verification_status: e.target.value as DocumentVerificationStatus }))}>
                {(['unverified', 'verified', 'rejected', 'pending_reupload'] as DocumentVerificationStatus[]).map(v => (
                  <option key={v} value={v}>{getDocStatusLabel(v, lang)}</option>
                ))}
              </select>
            </F>

            {/* 7. Notes */}
            <F label={t.fNotes}>
              <textarea style={{ ...INP, resize: 'vertical', minHeight: 60 }} value={edit.notes ?? ''} onChange={e => setEdit(v => ({ ...v!, notes: e.target.value }))} />
            </F>

            {/* Error */}
            {saveErr && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}>
                ⚠ {saveErr}
              </div>
            )}

            {/* 8. Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSave}
                disabled={!canSave}
                title={!canSave && !saving ? t.errNoFile : undefined}
                style={{ flex: 1, padding: '10px 0', background: canSave ? NAVY : '#94a3b8', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', transition: 'background .15s' }}
              >
                {saveLabel}
              </button>
              <button onClick={() => { setEdit(null); setSelectedFile(null); setSaveErr(null); }}
                style={{ padding: '10px 20px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T2, fontWeight: 600, cursor: 'pointer' }}>
                {c0.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LBL}>{label}</label>{children}</div>;
}
