// Invoice management page — /invoice
// Lists drafts and billing profiles; does NOT issue official invoices.
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import type { InvoiceDraft, BillingProfile } from '../types/invoice';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '../types/invoice';
import { getDrafts, getProfiles, updateDraftStatus } from '../lib/invoiceStore';
import { InvoicePreview } from '../components/invoice/InvoicePreview';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const TEXT = colors.textPrimary;
const MUTED = '#505A70';

type PageTab = 'drafts' | 'profiles';

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Drafts list ───────────────────────────────────────────────────────────────
function DraftsList() {
  const [drafts, setDrafts] = useState<InvoiceDraft[]>(() => getDrafts().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const [preview, setPreview] = useState<InvoiceDraft | null>(null);

  function refresh() { setDrafts(getDrafts().sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }

  function handleStatusChange(id: string, status: InvoiceDraft['status']) {
    updateDraftStatus(id, status);
    refresh();
    if (preview?.id === id) setPreview(d => d ? { ...d, status } : d);
  }

  if (drafts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: MUTED }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>🧾</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>暂无发票草稿</div>
        <div style={{ fontSize: 13 }}>在 AI Workspace 输入「帮我做一张发票」开始创建</div>
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
            return (
              <div
                key={d.id}
                onClick={() => setPreview(d)}
                style={{ background: preview?.id === d.id ? 'rgba(203,168,92,0.06)' : 'rgba(255,255,255,0.025)', border: `1px solid ${preview?.id === d.id ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: GOLD }}>{d.invoiceNo}</span>
                    <span style={{ fontSize: 10.5, color: sc.color, background: sc.bg, borderRadius: 4, padding: '2px 8px', fontFamily: 'IBM Plex Mono, monospace' }}>{INVOICE_STATUS_LABELS[d.status]}</span>
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
              <span style={{ fontSize: 11, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.15em' }}>INVOICE PREVIEW</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {preview.status === 'draft' && (
                  <button onClick={() => handleStatusChange(preview.id, 'waiting_approval')} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.35)', color: '#D4A843', fontSize: 11, cursor: 'pointer' }}>Submit for Approval</button>
                )}
                {preview.status === 'waiting_approval' && (
                  <button onClick={() => handleStatusChange(preview.id, 'approved')} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(111,191,142,0.15)', border: '1px solid rgba(111,191,142,0.35)', color: '#6FBF8E', fontSize: 11, cursor: 'pointer' }}>Approve</button>
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
function ProfilesList() {
  const [profiles] = useState<BillingProfile[]>(() => getProfiles());

  if (profiles.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: MUTED }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>🏢</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>暂无账单资料</div>
        <div style={{ fontSize: 13 }}>在 AI Workspace 创建第一张发票时，账单资料将自动保存</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
      {profiles.map(p => (
        <div key={p.id} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{p.customerName}</div>
          {p.billingName && p.billingName !== p.customerName && (
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>Billing: {p.billingName}</div>
          )}
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 2 }}>{p.billingAddress}</div>
          {p.trn && <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace', marginBottom: 2 }}>TRN: {p.trn}</div>}
          {p.phone && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 2 }}>{p.phone}</div>}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: GOLD, fontFamily: 'IBM Plex Mono, monospace' }}>{p.defaultCurrency} · VAT {p.defaultVatRate}%</span>
            {p.lastInvoiceDate && <span style={{ fontSize: 10.5, color: MUTED }}>Last: {p.lastInvoiceDate}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function InvoicePage() {
  const [tab, setTab] = useState<PageTab>('drafts');
  const navigate = useNavigate();

  const draftCount = getDrafts().length;
  const profileCount = getProfiles().length;

  return (
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 600, color: TEXT, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              Invoice Manager
            </h1>
            <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
              发票草稿 & 账单资料管理 — 所有发票在正式审批前均为 Draft 状态
            </p>
          </div>
          <button
            onClick={() => navigate('/ai?q=' + encodeURIComponent('帮我做一张发票'))}
            style={{ padding: '11px 22px', borderRadius: 10, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
          >+ 新建发票</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {([
          { key: 'drafts', label: '发票草稿', count: draftCount },
          { key: 'profiles', label: '账单资料库', count: profileCount },
        ] as { key: PageTab; label: string; count: number }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t.key ? GOLD_L : MUTED, fontSize: 13.5, fontWeight: tab === t.key ? 600 : 400, fontFamily: "'Space Grotesk',sans-serif", transition: 'all 0.15s', marginBottom: -1 }}
          >
            {t.label}
            <span style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 7px', color: MUTED, fontFamily: 'IBM Plex Mono, monospace' }}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'drafts' && <DraftsList />}
      {tab === 'profiles' && <ProfilesList />}
    </div>
  );
}
