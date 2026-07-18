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

// ── Design tokens (matches Business Solutions module) ─────────────────────────
const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const PAGE_BG = '#f5f3ef';
const CARD_BORDER = '#e8e0d0';

const TABS = [
  { key: 'overview',       label: '基础档案' },
  { key: 'contacts',       label: '联系人' },
  { key: 'products',       label: '产品与服务' },
  { key: 'documents',      label: '营业执照与公司文件' },
  { key: 'certifications', label: '认证与证书' },
  { key: 'quotes',         label: '历史报价' },
  { key: 'rating',         label: '评分与备注' },
] as const;

type TabKey = typeof TABS[number]['key'];

const STATUS_LABEL: Record<string, string> = {
  active: '正常', inactive: '停用', blacklisted: '黑名单', under_review: '审核中', archived: '封存',
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  active:       { bg: '#dcfce7', text: '#166534' },
  inactive:     { bg: '#f1f5f9', text: '#475569' },
  blacklisted:  { bg: '#fee2e2', text: '#991b1b' },
  under_review: { bg: '#fef9ec', text: '#92400e' },
  archived:     { bg: '#f8fafc', text: '#94a3b8' },
};

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
    <div style={{ background: PAGE_BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#94a3b8', fontSize: 14 }}>加载中…</span>
    </div>
  );
  if (!supplier) return (
    <div style={{ background: PAGE_BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#dc2626', fontSize: 14 }}>供应商不存在</span>
    </div>
  );

  const statusStyle = STATUS_COLOR[supplier.status ?? 'active'] ?? { bg: '#f1f5f9', text: '#475569' };

  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 48px' }}>

        {/* Back */}
        <button onClick={onBack} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          ← 返回列表
        </button>

        {/* ── Header card ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 24, border: `1px solid ${CARD_BORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.06)', marginBottom: 16, overflow: 'hidden' }}>
          {/* Accent line */}
          <div style={{ height: 4, background: `linear-gradient(90deg, ${NAVY} 0%, ${GOLD} 100%)` }} />

          <div style={{ padding: '20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>{supplier.supplier_name_display}</h1>
                  {supplier.is_preferred && <span style={{ fontSize: 16 }} title="常用供应商">⭐</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: NAVY + '14', color: NAVY }}>{supplier.supplier_type ?? '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: statusStyle.bg, color: statusStyle.text }}>
                    {STATUS_LABEL[supplier.status ?? 'active'] ?? supplier.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {supplier.short_code && <span>#{supplier.short_code}</span>}
                  {supplier.country && <span>🌍 {[supplier.country, supplier.city].filter(Boolean).join(', ')}</span>}
                  {supplier.current_rating && <span style={{ fontWeight: 700, color: supplier.current_rating === 'A' ? '#16a34a' : supplier.current_rating === 'D' ? '#dc2626' : NAVY }}>评级 {supplier.current_rating}</span>}
                  {supplier.internal_owner && <span>对接：{supplier.internal_owner}</span>}
                </div>
              </div>
              <button
                onClick={() => onEdit(supplier)}
                style={{ padding: '9px 20px', background: GOLD, color: NAVY, border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
              >
                编辑档案
              </button>
            </div>
          </div>
        </div>

        {/* ── Quick actions ────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(12,27,58,0.04)' }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>快捷操作</span>
          {[
            { label: '📄 上传营业执照', tab: 'documents' as TabKey },
            { label: '🏅 上传认证证书', tab: 'certifications' as TabKey },
            { label: '📁 上传产品目录', tab: 'documents' as TabKey },
            { label: '💰 上传供应商报价', tab: 'quotes' as TabKey },
            { label: '👤 新增联系人', tab: 'contacts' as TabKey },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => setTab(a.tab)}
              style={{
                padding: '7px 14px', borderRadius: 8,
                background: '#f5f3ef', border: `1px solid ${CARD_BORDER}`,
                fontSize: 12, fontWeight: 600, color: NAVY, cursor: 'pointer',
                transition: 'background .12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = `${GOLD}20`)}
              onMouseLeave={e => (e.currentTarget.style.background = '#f5f3ef')}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* ── Tabs + content ───────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 24, border: `1px solid ${CARD_BORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.06)', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${CARD_BORDER}`, overflowX: 'auto', background: '#fff' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '12px 18px', fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                  color: tab === t.key ? NAVY : '#475569',
                  border: 'none', borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
                  background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  marginBottom: -1, transition: 'color .15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '28px' }}>
            {tab === 'overview' && <OverviewTab supplier={supplier} />}
            {tab === 'contacts' && <ContactManager supplierId={supplierId} />}
            {tab === 'products' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${CARD_BORDER}` }}>产品</div>
                <ProductManager supplierId={supplierId} />
                <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '24px 0 16px', paddingBottom: 10, borderBottom: `1px solid ${CARD_BORDER}` }}>服务</div>
                <ServiceManager supplierId={supplierId} />
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

function OverviewTab({ supplier }: { supplier: Supplier }) {
  const LBL_S: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 };
  const ROW = ({ label, value }: { label: string; value?: string | null }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: NAVY, fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{value || '—'}</span>
    </div>
  );
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: '18px 20px' }}>
      <div style={LBL_S}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="基础信息">
          <ROW label="主显示名称" value={supplier.supplier_name_display} />
          <ROW label="中文名称" value={supplier.name_cn} />
          <ROW label="英文名称" value={supplier.name_en} />
          <ROW label="供应商编码" value={supplier.short_code} />
          <ROW label="国家 / 城市" value={[supplier.country, supplier.city].filter(Boolean).join(', ') || undefined} />
          <ROW label="网站" value={supplier.website} />
        </Card>
        <Card title="内部备注">
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {supplier.notes || <span style={{ color: '#cbd5e1' }}>暂无备注</span>}
          </div>
        </Card>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="供应品类">
          {supplier.product_categories?.length
            ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {supplier.product_categories.map(c => (
                  <span key={c} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: NAVY + '12', color: NAVY, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            : <span style={{ color: '#cbd5e1', fontSize: 13 }}>暂无品类</span>
          }
        </Card>
        <Card title="合作信息">
          <ROW label="付款条款" value={supplier.payment_terms} />
          <ROW label="默认交期" value={supplier.default_lead_time_days ? `${supplier.default_lead_time_days} 天` : undefined} />
          <ROW label="内部对接人" value={supplier.internal_owner} />
          <ROW label="创建时间" value={supplier.created_at?.slice(0, 10)} />
        </Card>
      </div>
    </div>
  );
}
