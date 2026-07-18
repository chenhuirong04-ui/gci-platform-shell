import React, { useEffect, useState } from 'react';
import type { Supplier, SupplierType, SupplierStatus, SupplierRating } from '../types';
import { createSupplier, generateShortCode, updateSupplier } from '../lib/suppliersCloud';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#CBD5E1';
const T2 = '#374151';   // gray-700 — readable label color on white
const T3 = '#6b7280';   // gray-500 — helper text
const BG = '#f8fafc';   // page background

const LBL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: T2,
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};
const INP: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`,
  fontSize: 14, color: NAVY, background: '#fff', outline: 'none',
};
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };
const ROW: React.CSSProperties = { display: 'grid', gap: 16, marginBottom: 20 };

const TYPES: SupplierType[] = ['Factory', 'Trading', 'Integrated', 'Service', 'Agent', 'Unknown'];
const STATUSES: { v: SupplierStatus; l: string }[] = [
  { v: 'active', l: '正常' }, { v: 'inactive', l: '停用' },
  { v: 'blacklisted', l: '黑名单' }, { v: 'under_review', l: '审核中' }, { v: 'archived', l: '封存' },
];
const RATINGS: SupplierRating[] = ['A', 'B', 'C', 'D'];

const EMPTY: Omit<Supplier, 'id' | 'short_code'> = {
  supplier_name_display: '', name_cn: '', name_en: '',
  supplier_type: 'Unknown', product_categories: [],
  country: '', city: '', is_preferred: false,
  status: 'active', current_rating: 'B',
  internal_owner: '', payment_terms: '', default_lead_time_days: undefined,
  website: '', notes: '',
};

interface Props {
  supplier?: Supplier;
  onSaved: (s: Supplier) => void;
  onCancel: () => void;
}

export default function SupplierForm({ supplier, onSaved, onCancel }: Props) {
  const isEdit = !!supplier?.id;
  const [form, setForm] = useState<Omit<Supplier, 'id' | 'short_code'>>(supplier ? { ...supplier } : { ...EMPTY });
  const [categoriesRaw, setCategoriesRaw] = useState((supplier?.product_categories ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.supplier_name_display.trim()) { setError('供应商名称不能为空'); return; }
    setSaving(true); setError('');
    try {
      const cats = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const payload = { ...form, product_categories: cats };
      if (isEdit && supplier?.id) {
        const ok = await updateSupplier(supplier.id, payload);
        if (ok) onSaved({ ...supplier, ...payload });
        else setError('保存失败，请重试');
      } else {
        const code = await generateShortCode('SUP-AUTO');
        const saved = await createSupplier({ ...payload, short_code: code, import_source: 'manual' });
        if (saved) onSaved(saved);
        else setError('创建失败，请重试');
      }
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 28px' }}>
        {/* Header */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <button onClick={onCancel} style={{ fontSize: 12, color: T3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10 }}>← 返回列表</button>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: 0 }}>
            {isEdit ? '编辑供应商' : '新增供应商'}
          </h2>
          <p style={{ fontSize: 13, color: T3, margin: '6px 0 0' }}>
            {isEdit ? '修改后保存即可更新档案' : '填写基础信息并保存，保存后可在详情页继续添加联系人、文件、认证等'}
          </p>
        </div>

        {/* Basic */}
        <Section title="基础信息">
          <div style={{ ...ROW, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Field label="主显示名称 *">
              <input style={INP} value={form.supplier_name_display} onChange={e => set('supplier_name_display', e.target.value)} placeholder="主显示名称" />
            </Field>
            <Field label="中文名称">
              <input style={INP} value={form.name_cn ?? ''} onChange={e => set('name_cn', e.target.value)} placeholder="中文名称" />
            </Field>
            <Field label="英文名称">
              <input style={INP} value={form.name_en ?? ''} onChange={e => set('name_en', e.target.value)} placeholder="English Name" />
            </Field>
          </div>
          <div style={{ ...ROW, gridTemplateColumns: '1fr 1fr' }}>
            <Field label="供应商类型">
              <select style={SEL} value={form.supplier_type ?? 'Unknown'} onChange={e => set('supplier_type', e.target.value as SupplierType)}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="供应品类（逗号分隔）">
              <input style={INP} value={categoriesRaw} onChange={e => setCategoriesRaw(e.target.value)} placeholder="如：卫生用品, 家居, FF&E" />
            </Field>
          </div>
        </Section>

        {/* Location */}
        <Section title="地区">
          <div style={{ ...ROW, gridTemplateColumns: '1fr 1fr' }}>
            <Field label="国家">
              <input style={INP} value={form.country ?? ''} onChange={e => set('country', e.target.value)} placeholder="China" />
            </Field>
            <Field label="城市">
              <input style={INP} value={form.city ?? ''} onChange={e => set('city', e.target.value)} placeholder="Guangzhou" />
            </Field>
          </div>
        </Section>

        {/* Trade */}
        <Section title="合作信息">
          <div style={{ ...ROW, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Field label="付款条款">
              <input style={INP} value={form.payment_terms ?? ''} onChange={e => set('payment_terms', e.target.value)} placeholder="30%+70% TT" />
            </Field>
            <Field label="默认交期（天）">
              <input style={INP} type="number" min={0} value={form.default_lead_time_days ?? ''} onChange={e => set('default_lead_time_days', Number(e.target.value) || undefined)} />
            </Field>
            <Field label="GCI 内部对接人">
              <input style={INP} value={form.internal_owner ?? ''} onChange={e => set('internal_owner', e.target.value)} placeholder="Chris / Lili" />
            </Field>
          </div>
          <div style={{ ...ROW, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Field label="状态">
              <select style={SEL} value={form.status ?? 'active'} onChange={e => set('status', e.target.value as SupplierStatus)}>
                {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </Field>
            <Field label="评级">
              <select style={SEL} value={form.current_rating ?? 'B'} onChange={e => set('current_rating', e.target.value as SupplierRating)}>
                {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="网站">
              <input style={INP} value={form.website ?? ''} onChange={e => set('website', e.target.value)} placeholder="https://..." />
            </Field>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.is_preferred} onChange={e => set('is_preferred', e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>常用供应商（标星）</span>
            </label>
          </div>
        </Section>

        {/* Notes */}
        <Section title="备注">
          <textarea
            style={{ ...INP, resize: 'vertical', minHeight: 80 }}
            value={form.notes ?? ''}
            onChange={e => set('notes', e.target.value)}
            placeholder="内部备注…"
          />
        </Section>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, padding: '12px 0', borderRadius: 8, background: saving ? '#94a3b8' : NAVY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? '保存中…' : isEdit ? '保存修改' : '创建供应商 →'}
          </button>
          <button
            onClick={onCancel}
            style={{ padding: '12px 24px', borderRadius: 8, border: `1.5px solid ${BORDER}`, background: '#fff', color: T2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LBL}>{label}</label>
      {children}
    </div>
  );
}
