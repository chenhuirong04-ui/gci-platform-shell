// Invoice management page — /invoice
// Data is loaded from Supabase (shared across Dubai + China team).
// localStorage is fallback only — shown clearly via Cloud Sync status badge.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import type { InvoiceDraft, BillingProfile } from '../types/invoice';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '../types/invoice';
import {
  getDrafts, getProfiles, updateDraftStatus, getCloudStatus,
} from '../lib/invoiceStore';
import { useAuth } from '../contexts/AuthContext';
import { InvoicePreview } from '../components/invoice/InvoicePreview';
import { BillingProfileDraftPanel } from '../components/invoice/BillingProfileDraftPanel';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const TEXT = colors.textPrimary;
const MUTED = '#505A70';

type PageTab = 'drafts' | 'profiles';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Cloud Sync badge ──────────────────────────────────────────────────────────
function CloudBadge({ status }: { status: ReturnType<typeof getCloudStatus> }) {
  const { dict } = useI18n();
  const t = dict.invoicePage;
  const connected = status === 'connected';
  const unknown   = status === 'unknown';
  const color  = connected ? '#6FBF8E' : unknown ? MUTED : '#D4A843';
  const bg     = connected ? 'rgba(111,191,142,0.10)' : unknown ? 'rgba(255,255,255,0.04)' : 'rgba(212,168,67,0.10)';
  const border = connected ? 'rgba(111,191,142,0.30)' : unknown ? 'rgba(255,255,255,0.1)' : 'rgba(212,168,67,0.35)';
  const label  = connected
    ? t.cloudConnected
    : unknown
    ? t.cloudChecking
    : t.cloudFallback;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 20, background: bg, border: `1px solid ${border}` }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10.5, color, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em' }}>{label}</span>
    </div>
  );
}

// ── Drafts list ───────────────────────────────────────────────────────────────
function DraftsList({ drafts, loading, onStatusChange }: {
  drafts: InvoiceDraft[];
  loading: boolean;
  onStatusChange: (id: string, status: InvoiceDraft['status']) => void;
}) {
  const { user } = useAuth();
  const { dict } = useI18n();
  const t = dict.invoicePage;
  const STATUS_LABEL: Record<InvoiceDraft['status'], string> = {
    draft:            t.statusDraft,
    waiting_approval: t.statusWaitingApproval,
    approved:         t.statusApproved,
    issued:           t.statusIssued,
    cancelled:        t.statusCancelled,
    paid:             t.statusPaid,
  };
  const [preview, setPreview] = useState<InvoiceDraft | null>(null);

  if (loading) {
    return <div style={{ padding: '60px 24px', textAlign: 'center', color: MUTED, fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' }}>{t.loadingInvoices}</div>;
  }

  if (drafts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: MUTED }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>🧾</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t.noDraftsTitle}</div>
        <div style={{ fontSize: 13 }}>{t.noDraftsHint}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* List */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drafts.map(d => {
            const sc = INVOICE_STATUS_COLORS[d.status];
            const ismine = d.createdBy === user?.id;
            return (
              <div
                key={d.id}
                onClick={() => setPreview(d)}
                style={{ background: preview?.id === d.id ? 'rgba(203,168,92,0.06)' : 'rgba(255,255,255,0.025)', border: `1px solid ${preview?.id === d.id ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: GOLD }}>{d.invoiceNo}</span>
                    <span style={{ fontSize: 10.5, color: sc.color, background: sc.bg, borderRadius: 4, padding: '2px 8px', fontFamily: 'IBM Plex Mono, monospace' }}>{STATUS_LABEL[d.status] ?? INVOICE_STATUS_LABELS[d.status]}</span>
                    {ismine && <span style={{ fontSize: 9.5, color: '#505A70', fontFamily: 'IBM Plex Mono, monospace' }}>{t.youBadge}</span>}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{d.currency} {fmt(d.total)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{d.customerName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED }}>
                  <span>{d.invoiceDate} → {d.dueDate}</span>
                  <span>{new Date(d.createdAt).toLocaleDateString('en-GB')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview panel */}
      {preview && (
        <div style={{ width: 460, flexShrink: 0 }}>
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.15em' }}>{t.invoicePreviewLabel}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {preview.status === 'draft' && (
                  <button
                    onClick={() => onStatusChange(preview.id, 'waiting_approval')}
                    style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.35)', color: '#D4A843', fontSize: 11, cursor: 'pointer' }}
                  >{t.submitForApproval}</button>
                )}
                {preview.status === 'waiting_approval' && (
                  <button
                    onClick={() => onStatusChange(preview.id, 'approved')}
                    style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(111,191,142,0.15)', border: '1px solid rgba(111,191,142,0.35)', color: '#6FBF8E', fontSize: 11, cursor: 'pointer' }}
                  >{t.approve}</button>
                )}
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
              <InvoicePreview draft={preview} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Billing profiles list ─────────────────────────────────────────────────────
function ProfilesList({ profiles, loading, onAdded }: { profiles: BillingProfile[]; loading: boolean; onAdded: (p: BillingProfile) => void }) {
  const { dict } = useI18n();
  const t = dict.invoicePage;
  const [showPanel, setShowPanel] = useState(false);
  if (loading) {
    return <div style={{ padding: '60px 24px', textAlign: 'center', color: MUTED, fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' }}>{t.loadingProfiles}</div>;
  }

  return (
    <div>
      {/* Add profile button + panel */}
      <div style={{ marginBottom: 20 }}>
        {!showPanel && (
          <button
            onClick={() => setShowPanel(true)}
            style={{ padding: '10px 22px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
          >{t.addBillingProfile}</button>
        )}
        {showPanel && (
          <BillingProfileDraftPanel
            directMode
            onClose={() => setShowPanel(false)}
            onSaved={p => { onAdded(p); setShowPanel(false); }}
          />
        )}
      </div>

      {profiles.length === 0 && !showPanel && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: MUTED }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>🏢</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t.noProfilesTitle}</div>
          <div style={{ fontSize: 13 }}>{t.noProfilesHint}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {profiles.map(p => (
          <div key={p.id} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{p.customerName}</div>
            {p.billingName && p.billingName !== p.customerName && (
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>{t.billingLabel}: {p.billingName}</div>
            )}
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 2 }}>{p.billingAddress}</div>
            {p.trn && <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace', marginBottom: 2 }}>TRN: {p.trn}</div>}
            {p.phone && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 2 }}>{p.phone}</div>}
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, color: GOLD, fontFamily: 'IBM Plex Mono, monospace' }}>{p.defaultCurrency} · VAT {p.defaultVatRate}%</span>
              {p.lastInvoiceDate && <span style={{ fontSize: 10.5, color: MUTED }}>{t.lastInvoiceLabel}: {p.lastInvoiceDate}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function InvoicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dict, lang } = useI18n();
  const t = dict.invoicePage;

  const [tab, setTab] = useState<PageTab>('drafts');
  const [drafts, setDrafts]     = useState<InvoiceDraft[]>([]);
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [cloudStatus, setCloudStatus] = useState<ReturnType<typeof getCloudStatus>>('unknown');

  useEffect(() => {
    Promise.all([getDrafts(), getProfiles()]).then(([d, p]) => {
      setDrafts(d);
      setProfiles(p);
      setCloudStatus(getCloudStatus());
      setLoading(false);
    });
  }, []);

  async function handleStatusChange(id: string, status: InvoiceDraft['status']) {
    const updated = await updateDraftStatus(id, status, user?.id);
    if (updated) {
      setDrafts(prev => prev.map(d => d.id === id ? updated : d));
    }
  }

  return (
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 600, color: TEXT, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              Invoice Manager
            </h1>
            <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
              {t.subtitle}
            </p>
          </div>
          <button
            onClick={() => navigate('/ai?q=' + encodeURIComponent(lang === 'en' ? 'Create an invoice for me' : '帮我做一张发票'))}
            style={{ padding: '11px 22px', borderRadius: 10, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}
          >{t.createInvoice}</button>
        </div>
        <CloudBadge status={cloudStatus} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {([
          { key: 'drafts',   label: t.tabDrafts,    count: drafts.length },
          { key: 'profiles', label: t.tabProfiles,   count: profiles.length },
        ] as { key: PageTab; label: string; count: number }[]).map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === tb.key ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === tb.key ? GOLD_L : MUTED, fontSize: 13.5, fontWeight: tab === tb.key ? 600 : 400, fontFamily: "'Space Grotesk',sans-serif", transition: 'all 0.15s', marginBottom: -1 }}
          >
            {tb.label}
            <span style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 7px', color: MUTED, fontFamily: 'IBM Plex Mono, monospace' }}>{tb.count}</span>
          </button>
        ))}
      </div>

      {tab === 'drafts'   && <DraftsList   drafts={drafts}     loading={loading} onStatusChange={handleStatusChange} />}
      {tab === 'profiles' && <ProfilesList profiles={profiles} loading={loading} onAdded={p => setProfiles(prev => [p, ...prev])} />}
    </div>
  );
}
