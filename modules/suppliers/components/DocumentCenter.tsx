import React, { useEffect, useState } from 'react';
import type { SupplierDocument, DocumentType, DocumentVerificationStatus } from '../types';
import {
  createDocument, deleteDocument, listDocuments, updateDocument,
  getDocumentUrl, resolveStorageBucket,
} from '../lib/documentsCloud';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#e2e8f0';
const T2 = '#374151';
const T3 = '#6b7280';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid #CBD5E1`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const DOC_TYPES: DocumentType[] = [
  '营业执照','公司注册文件','VAT文件','税务文件','公司简介',
  '产品目录','产品规格书','检测报告','报价原件','合同','NDA',
  '银行资料','工厂照片','审厂报告','其他',
];

const VSTATUS_LABEL: Record<DocumentVerificationStatus, string> = {
  unverified: '未核实', verified: '已核实', rejected: '已拒绝', pending_reupload: '待重传',
};
const VSTATUS_COLOR: Record<DocumentVerificationStatus, string> = {
  unverified: '#94a3b8', verified: '#16a34a', rejected: '#dc2626', pending_reupload: '#d97706',
};

const EMPTY = (sid: string): Omit<SupplierDocument, 'id'> => ({
  supplier_id: sid, document_type: '营业执照', document_name: '',
  file_url: '', document_number: '', issuing_authority: '',
  issue_date: '', expire_date: '', verification_status: 'unverified', notes: '',
});

interface Props { supplierId: string; }

export default function DocumentCenter({ supplierId }: Props) {
  const [docs, setDocs] = useState<SupplierDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<SupplierDocument> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const load = async () => { setLoading(true); setDocs(await listDocuments(supplierId)); setLoading(false); };
  useEffect(() => { load(); }, [supplierId]);

  const handleView = async (doc: SupplierDocument) => {
    if (!doc.id) return;
    if (signedUrls[doc.id]) { window.open(signedUrls[doc.id], '_blank'); return; }
    const url = await getDocumentUrl(doc);
    if (url) {
      setSignedUrls(m => ({ ...m, [doc.id!]: url }));
      window.open(url, '_blank');
    }
  };

  const handleSave = async () => {
    if (!edit?.document_name?.trim()) return;
    setSaving(true);
    try {
      const bucket = resolveStorageBucket(edit.document_type ?? '其他');
      if (edit.id) {
        await updateDocument(edit.id, edit);
      } else {
        await createDocument({ ...EMPTY(supplierId), ...edit, supplier_id: supplierId, storage_bucket: bucket });
      }
      setEdit(null); await load();
    } finally { setSaving(false); }
  };

  // Group by document_type
  const groups = DOC_TYPES.reduce((acc, t) => {
    const items = docs.filter(d => d.document_type === t);
    if (items.length) acc[t] = items;
    return acc;
  }, {} as Record<string, SupplierDocument[]>);
  const hasUncategorized = docs.filter(d => !DOC_TYPES.includes(d.document_type as DocumentType));

  // Expiry check
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  const expiryColor = (d: string | undefined) => !d ? '' : d < today ? '#dc2626' : d < soonStr ? '#d97706' : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>{docs.length} 份文件</span>
        <button onClick={() => setEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 添加文件记录</button>
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
                      <div style={{ fontSize: 11, color: T3, marginTop: 3, display: 'flex', gap: 10 }}>
                        {doc.issue_date && <span>签发：{doc.issue_date}</span>}
                        {doc.expire_date && <span style={{ color: ec || T3, fontWeight: ec ? 700 : undefined }}>到期：{doc.expire_date}{ec && ' ⚠'}</span>}
                        <span style={{ color: VSTATUS_COLOR[doc.verification_status as DocumentVerificationStatus] ?? T3 }}>
                          {VSTATUS_LABEL[doc.verification_status as DocumentVerificationStatus] ?? doc.verification_status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(doc.storage_path || doc.file_url) && (
                        <button onClick={() => handleView(doc)} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>查看</button>
                      )}
                      <button onClick={() => setEdit({ ...doc })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>编辑</button>
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

      {/* Add/Edit modal */}
      {edit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 540, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{edit.id ? '编辑文件' : '添加文件记录'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <F label="文件类型"><select style={INP} value={edit.document_type ?? '营业执照'} onChange={e => setEdit(v => ({ ...v!, document_type: e.target.value as DocumentType }))}>{DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></F>
              <F label="文件名称 *"><input style={INP} value={edit.document_name ?? ''} onChange={e => setEdit(v => ({ ...v!, document_name: e.target.value }))} placeholder="如：营业执照（正本）" /></F>
              <F label="证件号码"><input style={INP} value={edit.document_number ?? ''} onChange={e => setEdit(v => ({ ...v!, document_number: e.target.value }))} /></F>
              <F label="颁发机构"><input style={INP} value={edit.issuing_authority ?? ''} onChange={e => setEdit(v => ({ ...v!, issuing_authority: e.target.value }))} /></F>
              <F label="签发日期"><input style={INP} type="date" value={edit.issue_date ?? ''} onChange={e => setEdit(v => ({ ...v!, issue_date: e.target.value }))} /></F>
              <F label="到期日期"><input style={INP} type="date" value={edit.expire_date ?? ''} onChange={e => setEdit(v => ({ ...v!, expire_date: e.target.value }))} /></F>
            </div>
            <F label="外部链接（临时兼容）">
              <input style={INP} value={edit.file_url ?? ''} onChange={e => setEdit(v => ({ ...v!, file_url: e.target.value }))} placeholder="https://... (Notion 附件链接或临时链接)" />
            </F>
            <div style={{ background: '#fef9ec', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
              📌 正式文件请通过 Supabase Storage 上传，上传后系统自动使用安全私有链接。
            </div>
            <F label="核实状态">
              <select style={INP} value={edit.verification_status ?? 'unverified'} onChange={e => setEdit(v => ({ ...v!, verification_status: e.target.value as DocumentVerificationStatus }))}>
                {Object.entries(VSTATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="备注"><textarea style={{ ...INP, resize: 'vertical', minHeight: 60 }} value={edit.notes ?? ''} onChange={e => setEdit(v => ({ ...v!, notes: e.target.value }))} /></F>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px 0', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{saving ? '保存中…' : '保存'}</button>
              <button onClick={() => setEdit(null)} style={{ padding: '10px 20px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T2, fontWeight: 600, cursor: 'pointer' }}>取消</button>
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
