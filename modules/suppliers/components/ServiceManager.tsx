import React, { useEffect, useState } from 'react';
import type { SupplierService } from '../types';
import { createService, deleteService, listServices, updateService } from '../lib/suppliersCloud';

const NAVY = '#0B1F44';
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = '#94a3b8';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const CATS = ['物流', '清关', '检验', '认证代办', '仓储', '安装', '设计', '代理', '其他'];
const PRICING = ['fixed', 'hourly', 'percentage', 'project', 'custom'];

const EMPTY = (sid: string): Omit<SupplierService, 'id'> => ({
  supplier_id: sid, service_name: '', service_category: '', service_description: '',
  pricing_model: 'fixed', minimum_fee: undefined, currency: 'USD',
  service_area: '', coverage_countries: [], lead_time: '', terms: '', status: 'active', notes: '',
});

interface Props { supplierId: string; }

export default function ServiceManager({ supplierId }: Props) {
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
        <span style={{ fontSize: 13, color: T2 }}>{services.length} 项服务</span>
        <button onClick={() => setEdit(EMPTY(supplierId))} style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 新增服务</button>
      </div>
      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
       : services.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>暂无服务项目，请新增</div>
       : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {services.map(s => (
            <div key={s.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY }}>{s.service_name}</div>
                <div style={{ fontSize: 12, color: T2, marginTop: 3 }}>
                  {[s.service_category, s.pricing_model && `计价：${s.pricing_model}`, s.minimum_fee && `最低 ${s.minimum_fee} ${s.currency}`].filter(Boolean).join(' · ')}
                </div>
                {s.service_area && <div style={{ fontSize: 12, color: T3 }}>覆盖：{s.service_area}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEdit({ ...s })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>编辑</button>
                {deleteId === s.id
                  ? <><button onClick={async () => { await deleteService(s.id!); setDeleteId(null); load(); }} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>确认</button>
                      <button onClick={() => setDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button></>
                  : <button onClick={() => setDeleteId(s.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>删除</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{edit.id ? '编辑服务' : '新增服务'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <F label="服务名称 *"><input style={INP} value={edit.service_name ?? ''} onChange={e => setEdit(v => ({ ...v!, service_name: e.target.value }))} /></F>
              <F label="服务类别"><select style={INP} value={edit.service_category ?? ''} onChange={e => setEdit(v => ({ ...v!, service_category: e.target.value }))}><option value="">请选择</option>{CATS.map(c => <option key={c}>{c}</option>)}</select></F>
              <F label="计价方式"><select style={INP} value={edit.pricing_model ?? 'fixed'} onChange={e => setEdit(v => ({ ...v!, pricing_model: e.target.value }))}>{PRICING.map(p => <option key={p}>{p}</option>)}</select></F>
              <F label="最低收费"><input style={INP} type="number" value={edit.minimum_fee ?? ''} onChange={e => setEdit(v => ({ ...v!, minimum_fee: Number(e.target.value) || undefined }))} /></F>
              <F label="币种"><input style={INP} value={edit.currency ?? 'USD'} onChange={e => setEdit(v => ({ ...v!, currency: e.target.value }))} /></F>
              <F label="交期说明"><input style={INP} value={edit.lead_time ?? ''} onChange={e => setEdit(v => ({ ...v!, lead_time: e.target.value }))} placeholder="如：3–5 工作日" /></F>
            </div>
            <F label="服务区域"><input style={INP} value={edit.service_area ?? ''} onChange={e => setEdit(v => ({ ...v!, service_area: e.target.value }))} placeholder="中东、东南亚…" /></F>
            <F label="服务描述"><textarea style={{ ...INP, resize: 'vertical', minHeight: 60 }} value={edit.service_description ?? ''} onChange={e => setEdit(v => ({ ...v!, service_description: e.target.value }))} /></F>
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
