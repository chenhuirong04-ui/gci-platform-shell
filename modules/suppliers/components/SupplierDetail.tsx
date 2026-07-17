import React, { useEffect, useState } from 'react';
import type { Supplier } from '../types';
import { getSupplier } from '../lib/suppliersCloud';
import ContactManager from './ContactManager';
import ProductManager from './ProductManager';
import ServiceManager from './ServiceManager';
import DocumentCenter from './DocumentCenter';
import CertificationManager from './CertificationManager';
import CertProductLink from './CertProductLink';
import QuoteHistory from './QuoteHistory';
import RatingNotes from './RatingNotes';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = '#94a3b8';

const TABS = [
  { key: 'overview',      label: '概览' },
  { key: 'contacts',      label: '联系人' },
  { key: 'products',      label: '产品' },
  { key: 'services',      label: '服务' },
  { key: 'documents',     label: '文件' },
  { key: 'certifications',label: '认证' },
  { key: 'quotes',        label: '报价历史' },
] as const;

type TabKey = typeof TABS[number]['key'];

interface Props {
  supplierId: string;
  onBack: () => void;
  onEdit: (s: Supplier) => void;
}

export default function SupplierDetail({ supplierId, onBack, onEdit }: Props) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('overview');

  const load = async () => {
    setLoading(true);
    const s = await getSupplier(supplierId);
    setSupplier(s);
    setLoading(false);
  };
  useEffect(() => { load(); }, [supplierId]);

  if (loading) return <div style={{ padding: 40, color: T3, textAlign: 'center' }}>加载中…</div>;
  if (!supplier) return <div style={{ padding: 40, color: '#dc2626', textAlign: 'center' }}>供应商不存在</div>;

  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <button onClick={onBack} style={{ fontSize: 12, color: T2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}>← 返回列表</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>{supplier.supplier_name_display}</h1>
            {supplier.is_preferred && <span style={{ fontSize: 16 }} title="常用供应商">⭐</span>}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: NAVY + '14', color: NAVY }}>{supplier.supplier_type ?? '—'}</span>
          </div>
          <div style={{ fontSize: 12, color: T3, marginTop: 4 }}>
            {[supplier.short_code, supplier.country, supplier.city].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button onClick={() => onEdit(supplier)} style={{ padding: '9px 20px', background: GOLD, color: NAVY, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>编辑供应商</button>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { label: '评级', value: supplier.current_rating ?? '—', color: supplier.current_rating === 'A' ? '#16a34a' : supplier.current_rating === 'D' ? '#dc2626' : NAVY },
          { label: '状态', value: supplier.status ?? '—' },
          { label: '付款条款', value: supplier.payment_terms ?? '—' },
          { label: '交期', value: supplier.default_lead_time_days ? `${supplier.default_lead_time_days} 天` : '—' },
          { label: '对接人', value: supplier.internal_owner ?? '—' },
        ].map(s => (
          <div key={s.label} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 16px', minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.color ?? NAVY }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BORDER}`, marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              border: 'none', background: 'none',
              color: tab === t.key ? NAVY : T3,
              borderBottom: tab === t.key ? `2px solid ${NAVY}` : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <SectionCard title="基础信息">
                <Row label="主显示名称" value={supplier.supplier_name_display} />
                <Row label="中文名称" value={supplier.name_cn} />
                <Row label="英文名称" value={supplier.name_en} />
                <Row label="供应商代码" value={supplier.short_code} />
                <Row label="国家/城市" value={[supplier.country, supplier.city].filter(Boolean).join(', ') || '—'} />
                <Row label="网站" value={supplier.website} />
              </SectionCard>
              <SectionCard title="供应品类" style={{ marginTop: 16 }}>
                {supplier.product_categories?.length
                  ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {supplier.product_categories.map(c => <span key={c} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: NAVY + '12', color: NAVY, fontWeight: 600 }}>{c}</span>)}
                    </div>
                  : <span style={{ color: T3, fontSize: 13 }}>暂无</span>
                }
              </SectionCard>
            </div>
            <div>
              <SectionCard title="评价与备注">
                <RatingNotes supplier={supplier} onUpdated={setSupplier} />
              </SectionCard>
            </div>
          </div>
        )}
        {tab === 'contacts' && <ContactManager supplierId={supplierId} />}
        {tab === 'products' && <ProductManager supplierId={supplierId} />}
        {tab === 'services' && <ServiceManager supplierId={supplierId} />}
        {tab === 'documents' && (
          <div>
            <DocumentCenter supplierId={supplierId} />
            <div style={{ marginTop: 32, borderTop: `1px solid ${BORDER}`, paddingTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>认证与产品关联</div>
              <CertProductLink supplierId={supplierId} />
            </div>
          </div>
        )}
        {tab === 'certifications' && <CertificationManager supplierId={supplierId} />}
        {tab === 'quotes' && <QuoteHistory supplierId={supplierId} />}
      </div>
    </div>
  );
}

function SectionCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: T3, flexShrink: 0 }}>{label}</span>
      <span style={{ color: NAVY, fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}
