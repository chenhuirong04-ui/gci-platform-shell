import React, { useEffect, useState } from 'react';
import type { SupplierProduct } from '../types';
import { createProduct, deleteProduct, listProducts, updateProduct } from '../lib/suppliersCloud';

const NAVY = '#0B1F44';
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = '#94a3b8';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const EMPTY = (sid: string): Omit<SupplierProduct, 'id'> => ({
  supplier_id: sid, product_name_cn: '', product_name_en: '', supplier_sku: '',
  category: '', unit: '件', moq: undefined, default_currency: 'CNY',
  indicative_price_min: undefined, indicative_price_max: undefined,
  price_basis: 'EXW', lead_time_days: undefined, country_of_origin: 'China',
  oem_available: false, odm_available: false, private_label_available: false,
  status: 'active', notes: '',
});

interface Props { supplierId: string; }

export default function ProductManager({ supplierId }: Props) {
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<SupplierProduct> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => { setLoading(true); setProducts(await listProducts(supplierId)); setLoading(false); };
  useEffect(() => { load(); }, [supplierId]);

  const handleSave = async () => {
    if (!edit?.product_name_cn?.trim() && !edit?.product_name_en?.trim()) return;
    setSaving(true);
    try {
      if (edit.id) await updateProduct(edit.id, edit);
      else await createProduct({ ...EMPTY(supplierId), ...edit, supplier_id: supplierId });
      setEdit(null); await load();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>{products.length} 个产品</span>
        <button onClick={() => setEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 新增产品</button>
      </div>
      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
       : products.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>暂无产品，请新增</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {products.map(p => (
            <div key={p.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{p.product_name_cn || p.product_name_en || '—'}</div>
                <div style={{ fontSize: 12, color: T2, marginTop: 3 }}>
                  {[p.category, p.model, p.unit && `单位：${p.unit}`, p.moq && `MOQ：${p.moq}`].filter(Boolean).join(' · ')}
                </div>
                {(p.indicative_price_min || p.indicative_price_max) && (
                  <div style={{ fontSize: 12, color: T3, marginTop: 2 }}>
                    参考价：{p.indicative_price_min}–{p.indicative_price_max} {p.default_currency}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEdit({ ...p })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>编辑</button>
                {deleteId === p.id
                  ? <><button onClick={async () => { await deleteProduct(p.id!); setDeleteId(null); load(); }} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>确认</button>
                      <button onClick={() => setDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button></>
                  : <button onClick={() => setDeleteId(p.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>删除</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 580, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{edit.id ? '编辑产品' : '新增产品'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <F label="中文品名"><input style={INP} value={edit.product_name_cn ?? ''} onChange={e => setEdit(v => ({ ...v!, product_name_cn: e.target.value }))} /></F>
              <F label="英文品名"><input style={INP} value={edit.product_name_en ?? ''} onChange={e => setEdit(v => ({ ...v!, product_name_en: e.target.value }))} /></F>
              <F label="品类"><input style={INP} value={edit.category ?? ''} onChange={e => setEdit(v => ({ ...v!, category: e.target.value }))} /></F>
              <F label="型号"><input style={INP} value={edit.model ?? ''} onChange={e => setEdit(v => ({ ...v!, model: e.target.value }))} /></F>
              <F label="单位"><input style={INP} value={edit.unit ?? '件'} onChange={e => setEdit(v => ({ ...v!, unit: e.target.value }))} /></F>
              <F label="MOQ"><input style={INP} type="number" value={edit.moq ?? ''} onChange={e => setEdit(v => ({ ...v!, moq: Number(e.target.value) || undefined }))} /></F>
              <F label="参考价最低"><input style={INP} type="number" value={edit.indicative_price_min ?? ''} onChange={e => setEdit(v => ({ ...v!, indicative_price_min: Number(e.target.value) || undefined }))} /></F>
              <F label="参考价最高"><input style={INP} type="number" value={edit.indicative_price_max ?? ''} onChange={e => setEdit(v => ({ ...v!, indicative_price_max: Number(e.target.value) || undefined }))} /></F>
              <F label="价格基准"><select style={INP} value={edit.price_basis ?? 'EXW'} onChange={e => setEdit(v => ({ ...v!, price_basis: e.target.value }))}><option>EXW</option><option>FOB</option><option>CIF</option></select></F>
              <F label="币种"><input style={INP} value={edit.default_currency ?? 'CNY'} onChange={e => setEdit(v => ({ ...v!, default_currency: e.target.value }))} /></F>
              <F label="交期（天）"><input style={INP} type="number" value={edit.lead_time_days ?? ''} onChange={e => setEdit(v => ({ ...v!, lead_time_days: Number(e.target.value) || undefined }))} /></F>
              <F label="HS Code"><input style={INP} value={edit.hs_code ?? ''} onChange={e => setEdit(v => ({ ...v!, hs_code: e.target.value }))} /></F>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {([['oem_available','OEM'],['odm_available','ODM'],['private_label_available','私标']] as [keyof SupplierProduct, string][]).map(([k, l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!(edit as any)[k]} onChange={e => setEdit(v => ({ ...v!, [k]: e.target.checked }))} />{l}
                </label>
              ))}
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
