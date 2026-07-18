import React, { useState } from 'react';
import type { Supplier, SupplierType, SupplierStatus, SupplierRating } from '../types';
import { createSupplier, generateShortCode, updateSupplier } from '../lib/suppliersCloud';

// ── Design tokens (matches Business Solutions module exactly) ─────────────────
const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const PAGE_BG = '#f5f3ef';
const CARD_BORDER = '#e8e0d0';

const INP: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #b0bec5',
  fontSize: 15, color: '#0F172A', background: 'white', outline: 'none',
};
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6,
};
const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 24, padding: '28px',
  border: `1px solid ${CARD_BORDER}`,
  boxShadow: '0 1px 4px rgba(12,27,58,0.06)',
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: GOLD,
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20,
};
const ROW2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 };
const ROW3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 18 };

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

  // Completeness indicators for right panel
  const filled = [
    !!form.supplier_name_display,
    !!form.name_cn || !!form.name_en,
    !!form.supplier_type && form.supplier_type !== 'Unknown',
    !!form.country,
    !!form.payment_terms,
    !!form.internal_owner,
  ];
  const completeness = Math.round((filled.filter(Boolean).length / filled.length) * 100);

  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh' }}>
      <div style={{ padding: '24px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Back button */}
        <button
          onClick={onCancel}
          style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 18 }}
        >
          ← 返回列表
        </button>

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ═══ LEFT — Main form ═══════════════════════════════════════ */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Page title */}
            <div style={{ ...CARD }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>
                {isEdit ? '编辑供应商档案' : '新增供应商'}
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                {isEdit ? '修改后保存即可更新档案' : '填写基础信息，保存后可继续上传营业执照、认证证书、产品目录和报价'}
              </p>
            </div>

            {/* Basic info */}
            <div style={{ ...CARD }}>
              <div style={SECTION_TITLE}>1. 基础信息</div>
              <div style={ROW3}>
                <F label="主显示名称 *">
                  <input
                    style={{ ...INP, borderColor: !form.supplier_name_display ? '#e53e3e' : '#b0bec5' }}
                    value={form.supplier_name_display}
                    onChange={e => set('supplier_name_display', e.target.value)}
                    placeholder="供应商主显示名称"
                  />
                </F>
                <F label="中文名称">
                  <input style={INP} value={form.name_cn ?? ''} onChange={e => set('name_cn', e.target.value)} placeholder="中文名称" />
                </F>
                <F label="英文名称">
                  <input style={INP} value={form.name_en ?? ''} onChange={e => set('name_en', e.target.value)} placeholder="English Name" />
                </F>
              </div>
              <div style={ROW2}>
                <F label="供应商类型">
                  <select style={SEL} value={form.supplier_type ?? 'Unknown'} onChange={e => set('supplier_type', e.target.value as SupplierType)}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </F>
                <F label="供应品类（逗号分隔）">
                  <input style={INP} value={categoriesRaw} onChange={e => setCategoriesRaw(e.target.value)} placeholder="如：卫生用品, 家居, FF&E" />
                </F>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 600 }}>
                  <input type="checkbox" checked={!!form.is_preferred} onChange={e => set('is_preferred', e.target.checked)} style={{ width: 16, height: 16 }} />
                  常用供应商（标星 ⭐）
                </label>
              </div>
            </div>

            {/* Location */}
            <div style={{ ...CARD }}>
              <div style={SECTION_TITLE}>2. 地区</div>
              <div style={ROW2}>
                <F label="国家">
                  <input style={INP} value={form.country ?? ''} onChange={e => set('country', e.target.value)} placeholder="China / UAE" />
                </F>
                <F label="城市">
                  <input style={INP} value={form.city ?? ''} onChange={e => set('city', e.target.value)} placeholder="Guangzhou" />
                </F>
              </div>
            </div>

            {/* Cooperation info */}
            <div style={{ ...CARD }}>
              <div style={SECTION_TITLE}>3. 合作信息</div>
              <div style={ROW3}>
                <F label="付款条款">
                  <input style={INP} value={form.payment_terms ?? ''} onChange={e => set('payment_terms', e.target.value)} placeholder="30%+70% TT" />
                </F>
                <F label="默认交期（天）">
                  <input style={INP} type="number" min={0} value={form.default_lead_time_days ?? ''} onChange={e => set('default_lead_time_days', Number(e.target.value) || undefined)} />
                </F>
                <F label="GCI 内部对接人">
                  <input style={INP} value={form.internal_owner ?? ''} onChange={e => set('internal_owner', e.target.value)} placeholder="Chris / Lili" />
                </F>
              </div>
              <div style={ROW3}>
                <F label="状态">
                  <select style={SEL} value={form.status ?? 'active'} onChange={e => set('status', e.target.value as SupplierStatus)}>
                    {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </F>
                <F label="评级">
                  <select style={SEL} value={form.current_rating ?? 'B'} onChange={e => set('current_rating', e.target.value as SupplierRating)}>
                    {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </F>
                <F label="网站">
                  <input style={INP} value={form.website ?? ''} onChange={e => set('website', e.target.value)} placeholder="https://..." />
                </F>
              </div>
            </div>

            {/* Notes */}
            <div style={{ ...CARD }}>
              <div style={SECTION_TITLE}>4. 内部备注</div>
              <textarea
                style={{ ...INP, resize: 'vertical', minHeight: 80 }}
                value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                placeholder="仅内部可见的备注信息…"
              />
            </div>

            {/* Error + Save */}
            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#991b1b' }}>
                ✗ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 10,
                  background: saving ? '#94a3b8' : NAVY,
                  color: '#fff', border: 'none', fontSize: 15, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '保存中…' : isEdit ? '保存修改' : '创建供应商 →'}
              </button>
              <button
                onClick={onCancel}
                style={{
                  padding: '13px 28px', borderRadius: 10,
                  border: '1.5px solid #e8e0d0', background: '#fff',
                  color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>

          </div>

          {/* ═══ RIGHT — Summary card ════════════════════════════════════ */}
          <div style={{ width: 280, flexShrink: 0, position: 'sticky', top: 24 }}>
            <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={SECTION_TITLE}>档案完整度</div>

              {/* Progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#334155', fontWeight: 600 }}>基础信息</span>
                  <span style={{ color: NAVY, fontWeight: 700 }}>{completeness}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: '#e8e0d0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, background: completeness === 100 ? '#16a34a' : GOLD, width: `${completeness}%`, transition: 'width .3s' }} />
                </div>
              </div>

              {/* Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: '供应商名称', done: !!form.supplier_name_display },
                  { label: '中文或英文名称', done: !!(form.name_cn || form.name_en) },
                  { label: '供应商类型', done: !!form.supplier_type && form.supplier_type !== 'Unknown' },
                  { label: '国家', done: !!form.country },
                  { label: '付款条款', done: !!form.payment_terms },
                  { label: '内部对接人', done: !!form.internal_owner },
                ].map(({ label, done }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ color: done ? '#16a34a' : '#cbd5e1', fontSize: 15, flexShrink: 0 }}>{done ? '✓' : '○'}</span>
                    <span style={{ color: done ? '#334155' : '#94a3b8' }}>{label}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: `1px solid ${CARD_BORDER}`, paddingTop: 16 }}>
                {isEdit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <StatusRow label="营业执照" status="⚠ 请在详情页上传" />
                    <StatusRow label="认证证书" status="⚠ 请在详情页上传" />
                    <StatusRow label="联系人" status="⚠ 请在详情页添加" />
                    <StatusRow label="历史报价" status="⚠ 请在详情页上传" />
                  </div>
                ) : (
                  <div style={{ background: `${GOLD}18`, borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                    💡 保存基础档案后，可继续上传营业执照、认证证书、产品目录和报价。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LBL}>{label}</label>{children}</div>;
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: '#475569', fontWeight: 600 }}>{label}</span>
      <span style={{ color: '#94a3b8' }}>{status}</span>
    </div>
  );
}
