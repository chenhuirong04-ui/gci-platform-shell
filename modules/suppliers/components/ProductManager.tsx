import React, { useEffect, useState } from 'react';
import { useI18n } from '@gci/i18n';
import type { SupplierProduct } from '../types';
import { createProduct, deleteProduct, listProducts, updateProduct } from '../lib/suppliersCloud';
import { workspace, fontSizes, radii } from '@gci/design-system';
import { INPUT, LABEL, formGrid, MODAL_OVERLAY, MODAL_PANEL_CLASS, modalPanel, ModalPortal } from '../lib/ui';

const NAVY = workspace.textPrimary;
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = workspace.textSecondary;
const INP = INPUT;
const LBL = LABEL;

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
  const { dict } = useI18n();
  const t = dict.suppliers.products;
  const c0 = dict.suppliers.common;
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
        <span style={{ fontSize: fontSizes.sm, color: T2 }}>{t.count(products.length)}</span>
        <button onClick={() => setEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: workspace.actionPrimaryBg, color: '#fff', border: 'none', borderRadius: radii.sm, fontSize: fontSizes.sm, fontWeight: 700, cursor: 'pointer' }}>{t.add}</button>
      </div>
      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{c0.loading}</div>
       : products.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{t.empty}</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {products.map(p => (
            <div key={p.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: fontSizes.md }}>{p.product_name_cn || p.product_name_en || c0.notSet}</div>
                <div style={{ fontSize: fontSizes.xs, color: T2, marginTop: 3 }}>
                  {[p.category, p.model, p.unit && t.unit(p.unit), p.moq && t.moq(p.moq)].filter(Boolean).join(' · ')}
                </div>
                {(p.indicative_price_min || p.indicative_price_max) && (
                  <div style={{ fontSize: fontSizes.xs, color: T3, marginTop: 2 }}>
                    {t.refPrice}：{p.indicative_price_min}–{p.indicative_price_max} {p.default_currency}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEdit({ ...p })} style={{ fontSize: fontSizes.xs, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.edit}</button>
                {deleteId === p.id
                  ? <><button onClick={async () => { await deleteProduct(p.id!); setDeleteId(null); load(); }} style={{ fontSize: fontSizes.xs, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.confirm}</button>
                      <button onClick={() => setDeleteId(null)} style={{ fontSize: fontSizes.xs, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.cancel}</button></>
                  : <button onClick={() => setDeleteId(p.id!)} style={{ fontSize: fontSizes.xs, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.delete}</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <ModalPortal><div style={MODAL_OVERLAY} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className={MODAL_PANEL_CLASS} style={{ ...modalPanel(580), display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: fontSizes.lg, fontWeight: 700, color: NAVY }}>{edit.id ? t.modalEdit : t.modalNew}</div>
            <div style={{ ...formGrid(200), gap: 14 }}>
              <F label={t.fNameCn}><input style={INP} value={edit.product_name_cn ?? ''} onChange={e => setEdit(v => ({ ...v!, product_name_cn: e.target.value }))} /></F>
              <F label={t.fNameEn}><input style={INP} value={edit.product_name_en ?? ''} onChange={e => setEdit(v => ({ ...v!, product_name_en: e.target.value }))} /></F>
              <F label={t.fCategory}><input style={INP} value={edit.category ?? ''} onChange={e => setEdit(v => ({ ...v!, category: e.target.value }))} /></F>
              <F label={t.fModel}><input style={INP} value={edit.model ?? ''} onChange={e => setEdit(v => ({ ...v!, model: e.target.value }))} /></F>
              <F label={t.fUnit}><input style={INP} value={edit.unit ?? '件'} onChange={e => setEdit(v => ({ ...v!, unit: e.target.value }))} /></F>
              <F label={t.fMoq}><input style={INP} type="number" value={edit.moq ?? ''} onChange={e => setEdit(v => ({ ...v!, moq: Number(e.target.value) || undefined }))} /></F>
              <F label={t.fPriceMin}><input style={INP} type="number" value={edit.indicative_price_min ?? ''} onChange={e => setEdit(v => ({ ...v!, indicative_price_min: Number(e.target.value) || undefined }))} /></F>
              <F label={t.fPriceMax}><input style={INP} type="number" value={edit.indicative_price_max ?? ''} onChange={e => setEdit(v => ({ ...v!, indicative_price_max: Number(e.target.value) || undefined }))} /></F>
              <F label={t.fPriceBasis}><select style={INP} value={edit.price_basis ?? 'EXW'} onChange={e => setEdit(v => ({ ...v!, price_basis: e.target.value }))}><option>EXW</option><option>FOB</option><option>CIF</option></select></F>
              <F label={t.fCurrency}><input style={INP} value={edit.default_currency ?? 'CNY'} onChange={e => setEdit(v => ({ ...v!, default_currency: e.target.value }))} /></F>
              <F label={t.fLeadTime}><input style={INP} type="number" value={edit.lead_time_days ?? ''} onChange={e => setEdit(v => ({ ...v!, lead_time_days: Number(e.target.value) || undefined }))} /></F>
              <F label={t.fHsCode}><input style={INP} value={edit.hs_code ?? ''} onChange={e => setEdit(v => ({ ...v!, hs_code: e.target.value }))} /></F>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {([['oem_available',t.fOem],['odm_available',t.fOdm],['private_label_available',t.fPrivateLabel]] as [keyof SupplierProduct, string][]).map(([k, l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSizes.sm, fontWeight: 600, color: NAVY, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!(edit as any)[k]} onChange={e => setEdit(v => ({ ...v!, [k]: e.target.checked }))} />{l}
                </label>
              ))}
            </div>
            <F label={t.fNotes}><textarea style={{ ...INP, resize: 'vertical', minHeight: 60 }} value={edit.notes ?? ''} onChange={e => setEdit(v => ({ ...v!, notes: e.target.value }))} /></F>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px 0', background: workspace.actionPrimaryBg, color: '#fff', border: 'none', borderRadius: radii.sm, fontWeight: 700, cursor: 'pointer' }}>{saving ? c0.saving : c0.save}</button>
              <button onClick={() => setEdit(null)} style={{ padding: '10px 20px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: radii.sm, color: T2, fontWeight: 600, cursor: 'pointer' }}>{c0.cancel}</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LBL}>{label}</label>{children}</div>;
}
