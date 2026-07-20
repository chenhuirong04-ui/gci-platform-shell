import React, { useEffect, useRef, useState } from 'react';
import type { Supplier, SupplierDocument, DocumentType, DocumentVerificationStatus } from '../types';
import {
  createDocument, deleteDocument, listDocuments, updateDocument,
  getDocumentUrl, resolveStorageBucket, uploadSupplierFile,
} from '../lib/documentsCloud';
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

const VSTATUS_LABEL: Record<DocumentVerificationStatus, string> = {
  unverified: '未核实', verified: '已核实', rejected: '已拒绝', pending_reupload: '待重传',
};
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
  const [docs, setDocs] = useState<SupplierDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<SupplierDocument> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showLicenseUploader, setShowLicenseUploader] = useState(false);

  // File picker state (reset each time dialog opens)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => { setLoading(true); setDocs(await listDocuments(supplierId)); setLoading(false); };
  useEffect(() => { load(); }, [supplierId]);

  const openEdit = (doc: Partial<SupplierDocument>) => {
    setEdit(doc);
    setSelectedFile(null);
    setSaveErr(null);
    setUploading(false);
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
      setSaveErr(`不支持的文件格式：${f.name}（支持 PDF / XLS / DOC / JPG / PNG）`);
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
      setSaveErr('请选择本地文件，或填写外部链接');
      return;
    }
    if (!edit.document_name?.trim()) {
      setSaveErr('请填写文件名称');
      return;
    }

    setSaving(true); setSaveErr(null);
    try {
      let storagePatch: Partial<SupplierDocument> = {};

      if (selectedFile) {
        setUploading(true);
        const result = await uploadSupplierFile(supplierId, selectedFile, edit.document_type ?? '其他');
        setUploading(false);
        if (!result) {
          setSaveErr('文件上传失败，请检查网络后重试');
          setSaving(false);
          return;
        }
        storagePatch = {
          storage_bucket: result.bucket,
          storage_path: result.path,
          file_size: selectedFile.size,
          mime_type: selectedFile.type || 'application/octet-stream',
        };
      }

      const bucket = resolveStorageBucket(edit.document_type ?? '其他');
      const payload = { ...EMPTY(supplierId), ...edit, supplier_id: supplierId, storage_bucket: bucket, ...storagePatch };

      if (edit.id) {
        await updateDocument(edit.id, { ...edit, ...storagePatch });
      } else {
        await createDocument(payload);
      }

      setEdit(null);
      setSelectedFile(null);
      await load();
    } catch (e: any) {
      setSaveErr(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Group by document_type
  const groups = DOC_TYPES.reduce((acc, t) => {
    const items = docs.filter(d => d.document_type === t);
    if (items.length) acc[t] = items;
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
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>上传营业执照 / Upload Trade License</div>
        <TradeLicenseUploader
          supplier={supplier}
          onSaved={() => { setShowLicenseUploader(false); load(); }}
          onCancel={() => setShowLicenseUploader(false)}
        />
      </div>
    );
  }

  const canSave = !saving && (!!selectedFile || !!edit?.file_url?.trim() || !!edit?.storage_path);
  const saveLabel = uploading ? '上传中…' : saving ? '保存中…' : '保存';

  return (
    <div>
      {/* Primary upload actions */}
      <div style={{ background: '#fffbf0', border: `1.5px dashed ${GOLD}`, borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>快速上传</span>
        <button
          onClick={() => setShowLicenseUploader(true)}
          style={{ padding: '9px 18px', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          📄 上传营业执照 / Upload Trade License
        </button>
        <button
          onClick={() => openEdit({ ...EMPTY(supplierId), document_type: '产品目录' as DocumentType })}
          style={{ padding: '9px 18px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}
        >
          📁 上传其他文件
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>{docs.length} 份文件</span>
        <button onClick={() => openEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 添加文件记录</button>
      </div>

      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
       : docs.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>暂无文件记录，请添加</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(groups).map(([type, items]) => (
            <div key={type}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{type}</div>
              {items.map(doc => {
                const ec = expiryColor(doc.expire_date);
                return (
                  <div key={doc.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: NAVY, fontSize: 13 }}>{doc.document_name}</span>
                      {doc.document_number && <span style={{ fontSize: 11, color: T3, marginLeft: 8 }}>#{doc.document_number}</span>}
                      {doc.file_size && <span style={{ fontSize: 10, color: T3, marginLeft: 8 }}>{formatBytes(doc.file_size)}</span>}
                      <div style={{ fontSize: 11, color: T3, marginTop: 3, display: 'flex', gap: 10 }}>
                        {doc.issue_date && <span>签发：{doc.issue_date}</span>}
                        {doc.expire_date && <span style={{ color: ec || T3, fontWeight: ec ? 700 : undefined }}>到期：{doc.expire_date}{ec && ' ⚠'}</span>}
                        {doc.storage_path && <span style={{ color: '#16a34a' }}>✓ 已上传</span>}
                        <span style={{ color: VSTATUS_COLOR[doc.verification_status as DocumentVerificationStatus] ?? T3 }}>
                          {VSTATUS_LABEL[doc.verification_status as DocumentVerificationStatus] ?? doc.verification_status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(doc.storage_path || doc.file_url) && (
                        <button onClick={() => handleView(doc)} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>查看</button>
                      )}
                      <button onClick={() => openEdit({ ...doc })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>编辑</button>
                      {deleteId === doc.id
                        ? <><button onClick={async () => { await deleteDocument(doc.id!); setDeleteId(null); load(); }} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>确认</button>
                            <button onClick={() => setDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button></>
                        : <button onClick={() => setDeleteId(doc.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>删除</button>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{edit.id ? '编辑文件' : '添加文件记录'}</div>

            {/* 1. 文件类型 */}
            <F label="文件类型">
              <select style={INP} value={edit.document_type ?? '营业执照'}
                onChange={e => setEdit(v => ({ ...v!, document_type: e.target.value as DocumentType }))}>
                {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </F>

            {/* 2. 选择本地文件 */}
            <div>
              <label style={LBL}>选择本地文件 {!edit.storage_path && <span style={{ color: '#dc2626' }}>（必填，或填写外部链接）</span>}</label>

              {/* Existing file indicator */}
              {edit.storage_path && !selectedFile && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>✓ 已有上传文件</span>
                  <span style={{ color: T3 }}>重新选择文件将替换现有版本</span>
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
                      移除
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 28, opacity: 0.5 }}>📂</span>
                    <span style={{ fontSize: 13, color: T2, fontWeight: 600 }}>点击选择文件 或 拖拽到此处</span>
                    <span style={{ fontSize: 11, color: T3 }}>支持 PDF · XLS · XLSX · DOC · DOCX · JPG · PNG</span>
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
              {uploading && (
                <div style={{ marginTop: 8, background: '#f0f4ff', border: '1px solid #c7d7ff', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: NAVY, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #c7d7ff', borderTopColor: NAVY, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  正在上传文件，请勿关闭弹窗…
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
            </div>

            {/* 3. 文件名称 */}
            <F label="文件名称 *">
              <input style={INP} value={edit.document_name ?? ''}
                onChange={e => setEdit(v => ({ ...v!, document_name: e.target.value }))}
                placeholder="如：产品目录 2024（自动带入，可修改）" />
            </F>

            {/* 4. 外部链接（次要，历史兼容） */}
            <div>
              <label style={{ ...LBL, color: T3 }}>外部链接（可选，仅用于 Google Drive / Notion 历史链接兼容）</label>
              <input style={{ ...INP, border: '1.5px solid #e2e8f0', color: T3 }}
                value={edit.file_url ?? ''}
                onChange={e => setEdit(v => ({ ...v!, file_url: e.target.value }))}
                placeholder="https://... (无本地文件时使用)" />
            </div>

            {/* 5. 证件信息 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <F label="证件号码"><input style={INP} value={edit.document_number ?? ''} onChange={e => setEdit(v => ({ ...v!, document_number: e.target.value }))} /></F>
              <F label="颁发机构"><input style={INP} value={edit.issuing_authority ?? ''} onChange={e => setEdit(v => ({ ...v!, issuing_authority: e.target.value }))} /></F>
              <F label="签发日期"><input style={INP} type="date" value={edit.issue_date ?? ''} onChange={e => setEdit(v => ({ ...v!, issue_date: e.target.value }))} /></F>
              <F label="到期日期"><input style={INP} type="date" value={edit.expire_date ?? ''} onChange={e => setEdit(v => ({ ...v!, expire_date: e.target.value }))} /></F>
            </div>

            {/* 6. 核实状态 */}
            <F label="核实状态">
              <select style={INP} value={edit.verification_status ?? 'unverified'}
                onChange={e => setEdit(v => ({ ...v!, verification_status: e.target.value as DocumentVerificationStatus }))}>
                {Object.entries(VSTATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </F>

            {/* 7. 备注 */}
            <F label="备注">
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
                title={!canSave && !saving ? '请选择文件或填写外部链接' : undefined}
                style={{ flex: 1, padding: '10px 0', background: canSave ? NAVY : '#94a3b8', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', transition: 'background .15s' }}
              >
                {saveLabel}
              </button>
              <button onClick={() => { setEdit(null); setSelectedFile(null); setSaveErr(null); }}
                style={{ padding: '10px 20px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T2, fontWeight: 600, cursor: 'pointer' }}>
                取消
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
