import React, { useEffect, useState } from 'react';
import type { SupplierCertification, CertificationStatus } from '../types';
import { CERT_STATUS_LABEL } from '../types';
import {
  createCertification, deleteCertification, listCertifications, updateCertification,
} from '../lib/certificationsCloud';
import { listDocuments } from '../lib/documentsCloud';
import CertificationUploader from './CertificationUploader';

const NAVY = '#0B1F44';
const BORDER = '#e2e8f0';
const T2 = '#374151';
const T3 = '#6b7280';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid #CBD5E1`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const STATUS_COLOR: Record<CertificationStatus, { bg: string; text: string }> = {
  available:            { bg: '#dcfce7', text: '#166534' },
  not_available:        { bg: '#f1f5f9', text: '#475569' },
  pending_verification: { bg: '#fef9ec', text: '#92400e' },
  not_applicable:       { bg: '#f8fafc', text: '#94a3b8' },
  expired:              { bg: '#fee2e2', text: '#991b1b' },
};

const CERT_TYPES = [
  'ISO 9001', 'ISO 14001', 'CE', 'SASO', 'ESMA', 'EAC', 'FDA', 'REACH', 'RoHS', 'Halal', 'GSO', '其他',
];

const EMPTY = (sid: string): Omit<SupplierCertification, 'id'> => ({
  supplier_id: sid,
  certification_type: '',
  status: 'pending_verification',
  certification_number: '',
  issuing_body: '',
  market_scope: '',
  issue_date: '',
  expire_date: '',
  notes: '',
});

interface Props { supplierId: string; }

export default function CertificationManager({ supplierId }: Props) {
  const [certs, setCerts] = useState<SupplierCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<SupplierCertification> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [docCountMap, setDocCountMap] = useState<Record<string, number>>({});
  const [showUploader, setShowUploader] = useState(false);

  const load = async () => {
    setLoading(true);
    const list = await listCertifications(supplierId);
    setCerts(list);
    const allDocs = await listDocuments(supplierId);
    const map: Record<string, number> = {};
    for (const d of allDocs) {
      if (d.certification_id) map[d.certification_id] = (map[d.certification_id] ?? 0) + 1;
    }
    setDocCountMap(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, [supplierId]);

  const handleSave = async () => {
    if (!edit?.certification_type?.trim()) return;
    setSaving(true);
    try {
      if (edit.id) await updateCertification(edit.id, edit);
      else await createCertification({ ...EMPTY(supplierId), ...edit, supplier_id: supplierId });
      setEdit(null); await load();
    } finally { setSaving(false); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);

  // Uploader panel
  if (showUploader) {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>上传认证证书 / Upload Certification</div>
        <CertificationUploader
          supplierId={supplierId}
          onSaved={() => { setShowUploader(false); load(); }}
          onCancel={() => setShowUploader(false)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Primary upload action */}
      <div style={{ background: '#fffbf0', border: `1.5px dashed #C9A84C`, borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>快速上传</span>
        <button
          onClick={() => setShowUploader(true)}
          style={{ padding: '9px 18px', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          🏅 上传认证证书 / Upload Certification
        </button>
        <button
          onClick={() => setEdit(EMPTY(supplierId))}
          style={{ padding: '9px 18px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}
        >
          ＋ 手动新增认证（无文件）
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>{certs.length} 项认证</span>
      </div>

      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
       : certs.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>暂无认证记录，请添加</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {certs.map(cert => {
            const st = STATUS_COLOR[cert.status as CertificationStatus] ?? { bg: '#f1f5f9', text: '#475569' };
            const expColor = cert.expire_date
              ? cert.expire_date < today ? '#dc2626' : cert.expire_date < soonStr ? '#d97706' : ''
              : '';
            return (
              <div key={cert.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{cert.certification_type}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.text }}>
                      {CERT_STATUS_LABEL[cert.status as CertificationStatus] ?? cert.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: T2 }}>
                    {[cert.issuing_body, cert.market_scope && `适用：${cert.market_scope}`].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: 11, color: T3, marginTop: 3, display: 'flex', gap: 10 }}>
                    {cert.certification_number && <span>证书号：{cert.certification_number}</span>}
                    {cert.expire_date && <span style={{ color: expColor || T3, fontWeight: expColor ? 700 : undefined }}>到期：{cert.expire_date}{expColor && ' ⚠'}</span>}
                    {cert.id && docCountMap[cert.id] ? <span>📎 {docCountMap[cert.id]} 份文件</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEdit({ ...cert })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>编辑</button>
                  {deleteId === cert.id
                    ? <><button onClick={async () => { await deleteCertification(cert.id!); setDeleteId(null); load(); }} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>确认</button>
                        <button onClick={() => setDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button></>
                    : <button onClick={() => setDeleteId(cert.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>删除</button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 540, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{edit.id ? '编辑认证' : '新增认证'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <F label="认证名称 *">
                <select style={INP} value={edit.certification_type ?? ''} onChange={e => setEdit(v => ({ ...v!, certification_type: e.target.value }))}>
                  <option value="">请选择或输入</option>
                  {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </F>
              <F label="认证状态">
                <select style={INP} value={edit.status ?? 'pending_verification'} onChange={e => setEdit(v => ({ ...v!, status: e.target.value as CertificationStatus }))}>
                  {Object.entries(CERT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </F>
              <F label="证书号"><input style={INP} value={edit.certification_number ?? ''} onChange={e => setEdit(v => ({ ...v!, certification_number: e.target.value }))} /></F>
              <F label="颁发机构"><input style={INP} value={edit.issuing_body ?? ''} onChange={e => setEdit(v => ({ ...v!, issuing_body: e.target.value }))} /></F>
              <F label="适用市场"><input style={INP} value={edit.market_scope ?? ''} onChange={e => setEdit(v => ({ ...v!, market_scope: e.target.value }))} placeholder="中东、欧盟…" /></F>
              <F label="签发日期"><input style={INP} type="date" value={edit.issue_date ?? ''} onChange={e => setEdit(v => ({ ...v!, issue_date: e.target.value }))} /></F>
              <F label="到期日期"><input style={INP} type="date" value={edit.expire_date ?? ''} onChange={e => setEdit(v => ({ ...v!, expire_date: e.target.value }))} /></F>
            </div>
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
