import React, { useEffect, useState } from 'react';
import type { SupplierCertification, SupplierProduct, CertProductLink as CertProductLinkType } from '../types';
import { listCertifications } from '../lib/certificationsCloud';
import { listProducts } from '../lib/suppliersCloud';
import { createCertProductLink, deleteCertProductLink, listCertProductLinks } from '../lib/certificationsCloud';

const NAVY = '#0B1F44';
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = '#94a3b8';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

interface Props { supplierId: string; }

export default function CertProductLink({ supplierId }: Props) {
  const [links, setLinks] = useState<CertProductLinkType[]>([]);
  const [certs, setCerts] = useState<SupplierCertification[]>([]);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ certification_id: '', supplier_product_id: '', model_number: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([listCertifications(supplierId), listProducts(supplierId)]);
    setCerts(c); setProducts(p);
    if (c.length) {
      const allLinks = (await Promise.all(c.map(cert => listCertProductLinks(cert.id!)))).flat();
      setLinks(allLinks);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [supplierId]);

  const handleAdd = async () => {
    if (!form.certification_id || !form.supplier_product_id) return;
    setSaving(true);
    try {
      await createCertProductLink(form);
      setForm({ certification_id: '', supplier_product_id: '', model_number: '', notes: '' });
      await load();
    } finally { setSaving(false); }
  };

  const certMap = Object.fromEntries(certs.map(c => [c.id!, c.certification_name]));
  const prodMap = Object.fromEntries(products.map(p => [p.id!, p.product_name_cn || p.product_name_en || '—']));

  return (
    <div>
      <div style={{ fontSize: 13, color: T2, marginBottom: 16 }}>关联认证与产品，追踪哪些产品持有哪些认证</div>

      {/* Add form */}
      <div style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 12 }}>添加认证-产品关联</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LBL}>认证</label>
            <select style={INP} value={form.certification_id} onChange={e => setForm(f => ({ ...f, certification_id: e.target.value }))}>
              <option value="">选择认证</option>
              {certs.map(c => <option key={c.id} value={c.id!}>{c.certification_name}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>产品</label>
            <select style={INP} value={form.supplier_product_id} onChange={e => setForm(f => ({ ...f, supplier_product_id: e.target.value }))}>
              <option value="">选择产品</option>
              {products.map(p => <option key={p.id} value={p.id!}>{p.product_name_cn || p.product_name_en || '—'}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>型号（可选）</label>
            <input style={INP} value={form.model_number} onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))} placeholder="可填具体型号" />
          </div>
        </div>
        <button onClick={handleAdd} disabled={saving || !form.certification_id || !form.supplier_product_id} style={{ padding: '8px 20px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!form.certification_id || !form.supplier_product_id) ? 0.5 : 1 }}>
          {saving ? '添加中…' : '添加关联'}
        </button>
      </div>

      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 30 }}>加载中…</div>
       : links.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 30 }}>暂无认证-产品关联</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map(link => (
            <div key={link.id} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: NAVY }}>{certMap[link.certification_id] ?? link.certification_id}</span>
                <span style={{ color: T3, margin: '0 8px' }}>→</span>
                <span style={{ color: T2 }}>{prodMap[link.supplier_product_id] ?? link.supplier_product_id}</span>
                {link.model_number && <span style={{ color: T3, fontSize: 12, marginLeft: 8 }}>({link.model_number})</span>}
              </div>
              {deleteId === link.id
                ? <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={async () => { await deleteCertProductLink(link.id!); setDeleteId(null); load(); }} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>确认</button>
                    <button onClick={() => setDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button>
                  </div>
                : <button onClick={() => setDeleteId(link.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>删除</button>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
