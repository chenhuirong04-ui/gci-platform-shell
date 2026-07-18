import React, { useEffect, useState } from 'react';
import type { Supplier } from '../types';
import { getSupplier } from '../lib/suppliersCloud';
import ContactManager from './ContactManager';
import ProductManager from './ProductManager';
import ServiceManager from './ServiceManager';
import DocumentCenter from './DocumentCenter';
import CertificationManager from './CertificationManager';
import QuoteHistory from './QuoteHistory';
import RatingNotes from './RatingNotes';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#e2e8f0';
const T2 = '#374151';
const T3 = '#6b7280';
const BG = '#f8fafc';

const TABS = [
  { key: 'overview',      label: '基础档案' },
  { key: 'contacts',      label: '联系人' },
  { key: 'products',      label: '产品与服务' },
  { key: 'documents',     label: '营业执照与公司文件' },
  { key: 'certifications',label: '认证与证书' },
  { key: 'quotes',        label: '历史报价' },
  { key: 'rating',        label: '评分与备注' },
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

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: T3, fontSize: 14 }}>加载中…</span>
    </div>
  );
  if (!supplier) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#dc2626', fontSize: 14 }}>供应商不存在</span>
    </div>
  );

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>

        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 28px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <button onClick={onBack} style={{ fontSize: 12, color: T3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10 }}>← 返回列表</button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>{supplier.supplier_name_display}</h1>
                {supplier.is_preferred && <span style={{ fontSize: 16 }} title="常用供应商">⭐</span>}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: NAVY + '14', color: NAVY }}>{supplier.supplier_type ?? '—'}</span>
              </div>
              <div style={{ fontSize: 12, color: T3 }}>
                {[supplier.short_code, supplier.country, supplier.city].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={() => onEdit(supplier)} style={{ padding: '9px 20px', background: GOLD, color: NAVY, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>编辑档案</button>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: '评级', value: supplier.current_rating ?? '—', color: supplier.current_rating === 'A' ? '#16a34a' : supplier.current_rating === 'D' ? '#dc2626' : NAVY },
            { label: '状态', value: supplier.status ?? '—' },
            { label: '付款条款', value: supplier.payment_terms ?? '—' },
            { label: '交期', value: supplier.default_lead_time_days ? `${supplier.default_lead_time_days} 天` : '—' },
            { label: '对接人', value: supplier.internal_owner ?? '—' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 16px', minWidth: 90, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color ?? NAVY }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4 }}>快捷操作</span>
          {[
            { label: '+ 上传营业执照', tab: 'documents' as TabKey },
            { label: '+ 上传公司简介/目录', tab: 'documents' as TabKey },
            { label: '+ 上传供应商报价', tab: 'quotes' as TabKey },
            { label: '+ 新增认证', tab: 'certifications' as TabKey },
            { label: '+ 新增联系人', tab: 'contacts' as TabKey },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => setTab(a.tab)}
              style={{ padding: '6px 14px', borderRadius: 7, background: BG, border: `1.5px solid ${BORDER}`, fontSize: 12, fontWeight: 600, color: NAVY, cursor: 'pointer' }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `2px solid ${BORDER}`, overflowX: 'auto' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '12px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  border: 'none', background: 'none', whiteSpace: 'nowrap',
                  color: tab === t.key ? NAVY : T3,
                  borderBottom: tab === t.key ? `2px solid ${NAVY}` : '2px solid transparent',
                  marginBottom: -2,
                  transition: 'color .15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '24px 28px' }}>
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
                    <Row label="创建时间" value={supplier.created_at?.slice(0, 10)} />
                  </SectionCard>
                </div>
                <div>
                  <SectionCard title="供应品类">
                    {supplier.product_categories?.length
                      ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {supplier.product_categories.map(c => (
                            <span key={c} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: NAVY + '12', color: NAVY, fontWeight: 600 }}>{c}</span>
                          ))}
                        </div>
                      : <span style={{ color: T3, fontSize: 13 }}>暂无</span>
                    }
                  </SectionCard>
                  <SectionCard title="合作信息" style={{ marginTop: 16 }}>
                    <Row label="付款条款" value={supplier.payment_terms} />
                    <Row label="默认交期" value={supplier.default_lead_time_days ? `${supplier.default_lead_time_days} 天` : undefined} />
                    <Row label="内部对接人" value={supplier.internal_owner} />
                  </SectionCard>
                </div>
              </div>
            )}
            {tab === 'contacts' && <ContactManager supplierId={supplierId} />}
            {tab === 'products' && (
              <div>
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 14, padding: '0 0 10px', borderBottom: `1px solid ${BORDER}` }}>产品</div>
                  <ProductManager supplierId={supplierId} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 14, padding: '0 0 10px', borderBottom: `1px solid ${BORDER}` }}>服务</div>
                  <ServiceManager supplierId={supplierId} />
                </div>
              </div>
            )}
            {tab === 'documents' && <DocumentCenter supplierId={supplierId} supplier={supplier} />}
            {tab === 'certifications' && <CertificationManager supplierId={supplierId} />}
            {tab === 'quotes' && <QuoteHistory supplierId={supplierId} />}
            {tab === 'rating' && <RatingNotes supplier={supplier} onUpdated={setSupplier} />}
          </div>
        </div>

      </div>
    </div>
  );
}

function SectionCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{title}</div>
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
