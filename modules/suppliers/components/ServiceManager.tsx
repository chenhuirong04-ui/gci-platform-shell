import React, { useEffect, useState } from 'react';
import { useI18n } from '@gci/i18n';
import type { SupplierService } from '../types';
import { createService, deleteService, listServices, updateService } from '../lib/suppliersCloud';
import { workspace, fontSizes, radii } from '@gci/design-system';
import { INPUT, LABEL, formGrid, MODAL_OVERLAY, MODAL_PANEL_CLASS, modalPanel, ModalPortal } from '../lib/ui';

const NAVY = workspace.textPrimary;
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = workspace.textSecondary;
const INP = INPUT;
const LBL = LABEL;

const PRICING = ['fixed', 'hourly', 'percentage', 'project', 'custom'];

const EMPTY = (sid: string): Omit<SupplierService, 'id'> => ({
  supplier_id: sid, service_name: '', service_category: '', service_description: '',
  pricing_model: 'fixed', minimum_fee: undefined, currency: 'USD',
  service_area: '', coverage_countries: [], lead_time: '', terms: '', status: 'active', notes: '',
});

interface Props { supplierId: string; }

export default function ServiceManager({ supplierId }: Props) {
  const { dict } = useI18n();
  const t = dict.suppliers.services;
  const c0 = dict.suppliers.common;
  // Stored values stay Chinese (existing DB data); only the displayed label is localized.
  const CATS: [string, string][] = [
    ['物流', t.catLogistics], ['清关', t.catCustoms], ['检验', t.catInspection],
    ['认证代办', t.catCertAgent], ['仓储', t.catWarehousing], ['安装', t.catInstallation],
    ['设计', t.catDesign], ['代理', t.catAgent], ['其他', t.catOther],
  ];
  const [services, setServices] = useState<SupplierService[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<SupplierService> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => { setLoading(true); setServices(await listServices(supplierId)); setLoading(false); };
  useEffect(() => { load(); }, [supplierId]);

  const handleSave = async () => {
    if (!edit?.service_name?.trim()) return;
    setSaving(true);
    try {
      if (edit.id) await updateService(edit.id, edit);
      else await createService({ ...EMPTY(supplierId), ...edit, supplier_id: supplierId });
      setEdit(null); await load();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: fontSizes.sm, color: T2 }}>{t.count(services.length)}</span>
        <button onClick={() => setEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: workspace.actionPrimaryBg, color: '#fff', border: 'none', borderRadius: radii.sm, fontSize: fontSizes.sm, fontWeight: 700, cursor: 'pointer' }}>{t.add}</button>
      </div>
      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{c0.loading}</div>
       : services.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{t.empty}</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {services.map(s => (
            <div key={s.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY }}>{s.service_name}</div>
                <div style={{ fontSize: fontSizes.xs, color: T2, marginTop: 3 }}>
                  {[
                    s.service_category && (CATS.find(([v]) => v === s.service_category)?.[1] ?? s.service_category),
                    s.pricing_model && t.pricing(s.pricing_model),
                    s.minimum_fee && t.minFee(s.minimum_fee, s.currency ?? 'USD'),
                  ].filter(Boolean).join(' · ')}
                </div>
                {s.service_area && <div style={{ fontSize: fontSizes.xs, color: T3 }}>{t.coverage(s.service_area)}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEdit({ ...s })} style={{ fontSize: fontSizes.xs, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.edit}</button>
                {deleteId === s.id
                  ? <><button onClick={async () => { await deleteService(s.id!); setDeleteId(null); load(); }} style={{ fontSize: fontSizes.xs, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.confirm}</button>
                      <button onClick={() => setDeleteId(null)} style={{ fontSize: fontSizes.xs, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.cancel}</button></>
                  : <button onClick={() => setDeleteId(s.id!)} style={{ fontSize: fontSizes.xs, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.delete}</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <ModalPortal><div style={MODAL_OVERLAY} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className={MODAL_PANEL_CLASS} style={{ ...modalPanel(520), display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: fontSizes.lg, fontWeight: 700, color: NAVY }}>{edit.id ? t.modalEdit : t.modalNew}</div>
            <div style={{ ...formGrid(200), gap: 14 }}>
              <F label={t.fName}><input style={INP} value={edit.service_name ?? ''} onChange={e => setEdit(v => ({ ...v!, service_name: e.target.value }))} /></F>
              <F label={t.fCategory}><select style={INP} value={edit.service_category ?? ''} onChange={e => setEdit(v => ({ ...v!, service_category: e.target.value }))}><option value="">{c0.pleaseSelect}</option>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></F>
              <F label={t.fPricingModel}><select style={INP} value={edit.pricing_model ?? 'fixed'} onChange={e => setEdit(v => ({ ...v!, pricing_model: e.target.value }))}>{PRICING.map(p => <option key={p}>{p}</option>)}</select></F>
              <F label={t.fMinFee}><input style={INP} type="number" value={edit.minimum_fee ?? ''} onChange={e => setEdit(v => ({ ...v!, minimum_fee: Number(e.target.value) || undefined }))} /></F>
              <F label={t.fCurrency}><input style={INP} value={edit.currency ?? 'USD'} onChange={e => setEdit(v => ({ ...v!, currency: e.target.value }))} /></F>
              <F label={t.fLeadTime}><input style={INP} value={edit.lead_time ?? ''} onChange={e => setEdit(v => ({ ...v!, lead_time: e.target.value }))} placeholder={t.fLeadTimePlaceholder} /></F>
            </div>
            <F label={t.fArea}><input style={INP} value={edit.service_area ?? ''} onChange={e => setEdit(v => ({ ...v!, service_area: e.target.value }))} placeholder={t.fAreaPlaceholder} /></F>
            <F label={t.fDescription}><textarea style={{ ...INP, resize: 'vertical', minHeight: 60 }} value={edit.service_description ?? ''} onChange={e => setEdit(v => ({ ...v!, service_description: e.target.value }))} /></F>
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
