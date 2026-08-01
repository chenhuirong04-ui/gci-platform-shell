import React, { useEffect, useState } from 'react';
import { useI18n } from '@gci/i18n';
import type { Supplier } from '../types';
import { getSupplier } from '../lib/suppliersCloud';
import { getStatusLabel } from '../lib/labelMaps';
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

type TabKey = 'overview' | 'contacts' | 'products' | 'documents' | 'certifications' | 'quotes' | 'rating';

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
  const { lang, dict } = useI18n();
  const t = dict.suppliers.detail;
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview',       label: t.tabs.overview },
    { key: 'contacts',       label: t.tabs.contacts },
    { key: 'products',       label: t.tabs.products },
    { key: 'documents',      label: t.tabs.documents },
    { key: 'certifications', label: t.tabs.certifications },
    { key: 'quotes',         label: t.tabs.quotes },
    { key: 'rating',         label: t.tabs.rating },
  ];
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
      <span style={{ color: '#94a3b8', fontSize: 14 }}>{dict.suppliers.common.loading}</span>
    </div>
  );
  if (!supplier) return (
    <div style={{ background: PAGE_BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#dc2626', fontSize: 14 }}>{t.notFound}</span>
    </div>
  );

  const statusStyle = STATUS_COLOR[supplier.status ?? 'active'] ?? { bg: '#f1f5f9', text: '#475569' };

  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 48px' }}>

        {/* Back */}
        <button onClick={onBack} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          {dict.suppliers.common.back}
        </button>

        {/* ── Header card ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 24, border: `1px solid ${CARD_BORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.06)', marginBottom: 16, overflow: 'hidden' }}>
          {/* Accent line */}
          <div style={{ height: 4, background: `linear-gradient(90deg, ${NAVY} 0%, ${GOLD} 100%)` }} />

          <div style={{ padding: '20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <h1 translate="no" className="notranslate" style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>{supplier.supplier_name_display}</h1>
                  {supplier.is_preferred && <span style={{ fontSize: 16 }} title={t.preferredTitle}>⭐</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: NAVY + '14', color: NAVY }}>{supplier.supplier_type ?? dict.suppliers.common.notSet}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: statusStyle.bg, color: statusStyle.text }}>
                    {getStatusLabel(supplier.status ?? 'active', lang)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {supplier.short_code && <span>#{supplier.short_code}</span>}
                  {supplier.country && <span>🌍 {[supplier.country, supplier.city].filter(Boolean).join(', ')}</span>}
                  {supplier.current_rating && <span style={{ fontWeight: 700, color: supplier.current_rating === 'A' ? '#16a34a' : supplier.current_rating === 'D' ? '#dc2626' : NAVY }}>{t.ratingLabel(supplier.current_rating)}</span>}
                  {supplier.internal_owner && <span>{t.ownerLabel(supplier.internal_owner)}</span>}
                </div>
              </div>
              <button
                onClick={() => onEdit(supplier)}
                style={{ padding: '9px 20px', background: GOLD, color: NAVY, border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
              >
                {t.editProfile}
              </button>
            </div>
          </div>
        </div>

        {/* ── Quick actions ────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(12,27,58,0.04)' }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>{t.quickActionsLabel}</span>
          {[
            { label: t.qaUploadLicense, tab: 'documents' as TabKey },
            { label: t.qaUploadCert, tab: 'certifications' as TabKey },
            { label: t.qaUploadCatalog, tab: 'documents' as TabKey },
            { label: t.qaUploadQuote, tab: 'quotes' as TabKey },
            { label: t.qaAddContact, tab: 'contacts' as TabKey },
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
            {TABS.map(tb => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                style={{
                  padding: '12px 18px', fontSize: 13, fontWeight: tab === tb.key ? 700 : 500,
                  color: tab === tb.key ? NAVY : '#475569',
                  border: 'none', borderBottom: tab === tb.key ? `2px solid ${GOLD}` : '2px solid transparent',
                  background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  marginBottom: -1, transition: 'color .15s',
                }}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '28px' }}>
            {tab === 'overview' && <OverviewTab supplier={supplier} />}
            {tab === 'contacts' && <ContactManager supplierId={supplierId} />}
            {tab === 'products' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${CARD_BORDER}` }}>{t.productsLabel}</div>
                <ProductManager supplierId={supplierId} />
                <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '24px 0 16px', paddingBottom: 10, borderBottom: `1px solid ${CARD_BORDER}` }}>{t.servicesLabel}</div>
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
  const { dict } = useI18n();
  const o = dict.suppliers.detail.overview;
  const notSet = dict.suppliers.common.notSet;
  const LBL_S: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 };
  const ROW = ({ label, value }: { label: string; value?: string | null }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: NAVY, fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{value || notSet}</span>
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
        <Card title={o.basicInfo}>
          <ROW label={o.displayName} value={supplier.supplier_name_display} />
          <ROW label={o.nameCn} value={supplier.name_cn} />
          <ROW label={o.nameEn} value={supplier.name_en} />
          <ROW label={o.code} value={supplier.short_code} />
          <ROW label={o.countryCity} value={[supplier.country, supplier.city].filter(Boolean).join(', ') || undefined} />
          <ROW label={o.website} value={supplier.website} />
        </Card>
        <Card title={o.internalNotes}>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {supplier.notes || <span style={{ color: '#cbd5e1' }}>{o.noNotes}</span>}
          </div>
        </Card>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title={o.categories}>
          {supplier.product_categories?.length
            ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {supplier.product_categories.map(c => (
                  <span key={c} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: NAVY + '12', color: NAVY, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            : <span style={{ color: '#cbd5e1', fontSize: 13 }}>{o.noCategories}</span>
          }
        </Card>
        <Card title={o.cooperation}>
          <ROW label={o.paymentTerms} value={supplier.payment_terms} />
          <ROW label={o.defaultLeadTime} value={supplier.default_lead_time_days ? `${supplier.default_lead_time_days} ${o.days}` : undefined} />
          <ROW label={o.internalOwner} value={supplier.internal_owner} />
          <ROW label={o.createdAt} value={supplier.created_at?.slice(0, 10)} />
        </Card>
      </div>
    </div>
  );
}
