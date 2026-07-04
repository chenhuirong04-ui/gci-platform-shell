// InvoiceAssistantPanel — 4-step wizard embedded in AI Assistant tab.
// Step 0: Select or create billing profile
// Step 1: Invoice details (items, dates)
// Step 2: Preview (paper style)
// Step 3: Saved confirmation
import { useState, useCallback } from 'react';
import type { BillingProfile, InvoiceDraft, InvoiceLineItem } from '../../types/invoice';
import { GCI_COMPANY } from '../../types/invoice';
import {
  getProfiles, saveProfile,
  saveDraft, updateDraftStatus, stampLastInvoiceDate,
} from '../../lib/invoiceStore';
import { InvoicePreview } from './InvoicePreview';
import { colors } from '@gci/design-system';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const TEXT = colors.textPrimary;
const MUTED = '#505A70';

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function today() { return new Date().toISOString().split('T')[0]; }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0];
}

// ── Sub-types ─────────────────────────────────────────────────────────────────
interface DraftFields {
  currency: string;
  invoiceDate: string;
  dueDate: string;
  vatRate: number;
  paymentTerms: string;
  otherComments: string;
  relatedPI: string;
  relatedQuotation: string;
  relatedOrder: string;
  notes: string;
  items: InvoiceLineItem[];
}

function emptyItem(): InvoiceLineItem {
  return { id: uid(), description: '', unitPrice: 0, qty: 1, amount: 0 };
}

function computeTotals(items: InvoiceLineItem[], vatRate: number) {
  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const vatAmount = Math.round(subtotal * vatRate) / 100;
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

// ── Step 0: Profile selection ─────────────────────────────────────────────────
function ProfileStep({ onSelect }: { onSelect: (p: BillingProfile) => void }) {
  const [profiles, setProfiles] = useState<BillingProfile[]>(() => getProfiles());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerName: '', billingName: '', billingAddress: '',
    phone: '', email: '', trn: '', country: 'UAE', city: 'Dubai',
    defaultCurrency: 'AED' as const, defaultVatRate: 5,
    defaultPaymentTerms: GCI_COMPANY.defaultPaymentTerms, notes: '',
  });

  function handleSaveNew() {
    if (!form.customerName.trim() || !form.billingAddress.trim()) return;
    const p = saveProfile({ ...form, status: 'active' });
    setProfiles(getProfiles());
    onSelect(p);
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10,
    flexDirection: 'column',
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: MUTED, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' };
  const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: TEXT, outline: 'none', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
        选择已有账单资料，或录入新客户。账单资料保存后，以后开发票无需重复填写。
      </div>

      {/* Existing profiles */}
      {profiles.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10.5, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.18em', marginBottom: 10 }}>SAVED BILLING PROFILES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(203,168,92,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(203,168,92,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.025)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{p.customerName}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{p.billingAddress}</div>
                    {p.trn && <div style={{ fontSize: 10.5, color: MUTED, fontFamily: 'monospace' }}>TRN: {p.trn}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em', marginLeft: 16 }}>SELECT →</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create new */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{ width: '100%', padding: '11px', border: `1px dashed rgba(203,168,92,0.35)`, borderRadius: 10, background: 'none', color: GOLD_L, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
        >+ 新增账单资料</button>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.15em', marginBottom: 16 }}>NEW BILLING PROFILE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {[
              { key: 'customerName', label: 'Customer Name *', placeholder: 'e.g. IFZA FZCO', full: true },
              { key: 'billingName', label: 'Billing Name (if different)', placeholder: 'Leave blank if same', full: true },
              { key: 'billingAddress', label: 'Billing Address *', placeholder: 'Full address', full: true },
              { key: 'trn', label: 'TRN', placeholder: '100xxxxxxx00003' },
              { key: 'phone', label: 'Phone', placeholder: '+971 4 xxx xxxx' },
              { key: 'email', label: 'Email', placeholder: 'billing@company.com' },
              { key: 'city', label: 'City', placeholder: 'Dubai' },
              { key: 'country', label: 'Country', placeholder: 'UAE' },
            ].map(f => (
              <div key={f.key} style={{ ...rowStyle, gridColumn: f.full ? '1 / -1' : undefined }}>
                <span style={labelStyle}>{f.label}</span>
                <input
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
            <div style={{ ...rowStyle, gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Default Payment Terms</span>
              <input value={form.defaultPaymentTerms} onChange={e => setForm(p => ({ ...p, defaultPaymentTerms: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={handleSaveNew}
              disabled={!form.customerName.trim() || !form.billingAddress.trim()}
              style={{ flex: 1, padding: '10px', borderRadius: 8, background: form.customerName.trim() && form.billingAddress.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: form.customerName.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk',sans-serif" }}
            >保存账单资料并继续</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 1: Invoice form ──────────────────────────────────────────────────────
function InvoiceFormStep({ profile, fields, onChange, onBack, onNext }: {
  profile: BillingProfile;
  fields: DraftFields;
  onChange: (f: Partial<DraftFields>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const inputStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 11px', fontSize: 13, color: TEXT, outline: 'none', boxSizing: 'border-box', width: '100%' };
  const labelStyle: React.CSSProperties = { fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em', marginBottom: 4, display: 'block' };

  function updateItem(id: string, patch: Partial<InvoiceLineItem>) {
    const updated = fields.items.map(it => {
      if (it.id !== id) return it;
      const merged = { ...it, ...patch };
      merged.amount = Math.round(merged.unitPrice * merged.qty * 100) / 100;
      return merged;
    });
    onChange({ items: updated });
  }

  function addItem() {
    onChange({ items: [...fields.items, emptyItem()] });
  }

  function removeItem(id: string) {
    if (fields.items.length <= 1) return;
    onChange({ items: fields.items.filter(it => it.id !== id) });
  }

  const hasItems = fields.items.some(it => it.description.trim());

  return (
    <div>
      {/* Bill To info card */}
      <div style={{ background: 'rgba(203,168,92,0.06)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.15em', marginBottom: 6 }}>BILL TO — 已自动带出，以后无需重复输入</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{profile.customerName}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{profile.billingAddress}</div>
        {profile.trn && <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>TRN: {profile.trn}</div>}
      </div>

      {/* Dates + currency row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Invoice Date', key: 'invoiceDate', type: 'date' },
          { label: 'Due Date', key: 'dueDate', type: 'date' },
          { label: 'Currency', key: 'currency', type: 'text' },
        ].map(f => (
          <div key={f.key}>
            <label style={labelStyle}>{f.label}</label>
            <input type={f.type} value={(fields as any)[f.key]} onChange={e => onChange({ [f.key]: e.target.value } as any)} style={inputStyle} />
          </div>
        ))}
      </div>

      {/* VAT rate */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>VAT Rate (%)</label>
        <input type="number" value={fields.vatRate} min={0} max={100} onChange={e => onChange({ vatRate: Number(e.target.value) })} style={{ ...inputStyle, width: 120 }} />
      </div>

      {/* Items table */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10.5, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.15em', marginBottom: 10 }}>INVOICE ITEMS</div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 110px 36px', gap: 0, background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Description', 'Unit Price', 'Qty', 'Amount', ''].map(h => (
              <div key={h} style={{ fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' }}>{h}</div>
            ))}
          </div>
          {fields.items.map((item, i) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 110px 36px', gap: 0, padding: '8px 12px', borderBottom: i < fields.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined, alignItems: 'center' }}>
              <input value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Service / product description" style={{ ...inputStyle, fontSize: 12 }} />
              <input type="number" value={item.unitPrice || ''} onChange={e => updateItem(item.id, { unitPrice: Number(e.target.value) })} placeholder="0.00" style={{ ...inputStyle, fontSize: 12, marginLeft: 6 }} />
              <input type="number" value={item.qty} min={1} onChange={e => updateItem(item.id, { qty: Number(e.target.value) })} style={{ ...inputStyle, fontSize: 12, marginLeft: 6 }} />
              <div style={{ fontSize: 13, color: TEXT, textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', paddingRight: 4 }}>
                {item.amount > 0 ? item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </div>
              <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3A4255', fontSize: 16, lineHeight: 1 }} title="Remove row">×</button>
            </div>
          ))}
        </div>
        <button onClick={addItem} style={{ marginTop: 8, background: 'none', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 16px', color: MUTED, fontSize: 12, cursor: 'pointer', width: '100%' }}>+ Add line item</button>
      </div>

      {/* Totals preview */}
      {hasItems && (() => {
        const { subtotal, vatAmount, total } = computeTotals(fields.items, fields.vatRate);
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 20px', minWidth: 220 }}>
              {[['Subtotal', subtotal], ['VAT ' + fields.vatRate + '%', vatAmount]].map(([l, v]) => (
                <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 12, color: MUTED, marginBottom: 4 }}>
                  <span>{l}</span><span>{Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 14, fontWeight: 700, color: TEXT, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 4 }}>
                <span>Total ({fields.currency})</span>
                <span>{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Payment terms + comments */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Payment Terms</label>
        <input value={fields.paymentTerms} onChange={e => onChange({ paymentTerms: e.target.value })} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Other Comments</label>
        <textarea value={fields.otherComments} onChange={e => onChange({ otherComments: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>← Back</button>
        <button
          onClick={onNext}
          disabled={!hasItems}
          style={{ flex: 1, padding: '10px', borderRadius: 8, background: hasItems ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: hasItems ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk',sans-serif" }}
        >预览发票 →</button>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

export function InvoiceAssistantPanel({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [fields, setFields] = useState<DraftFields>({
    currency: GCI_COMPANY.defaultCurrency,
    invoiceDate: today(),
    dueDate: addDays(today(), 15),
    vatRate: GCI_COMPANY.defaultVatRate,
    paymentTerms: GCI_COMPANY.defaultPaymentTerms,
    otherComments: '',
    relatedPI: '', relatedQuotation: '', relatedOrder: '', notes: '',
    items: [emptyItem()],
  });
  const [savedDraft, setSavedDraft] = useState<InvoiceDraft | null>(null);

  const updateFields = useCallback((patch: Partial<DraftFields>) => {
    setFields(prev => ({ ...prev, ...patch }));
  }, []);

  function handleProfileSelect(p: BillingProfile) {
    setProfile(p);
    setFields(prev => ({
      ...prev,
      currency: p.defaultCurrency,
      vatRate: p.defaultVatRate,
      paymentTerms: p.defaultPaymentTerms || prev.paymentTerms,
    }));
    setStep(1);
  }

  function buildBillTo(p: BillingProfile): InvoiceDraft['billTo'] {
    return {
      name: p.billingName || p.customerName,
      address: p.billingAddress,
      phone: p.phone,
      email: p.email,
      trn: p.trn,
    };
  }

  function buildPreviewDraft() {
    const { subtotal, vatAmount, total } = computeTotals(fields.items, fields.vatRate);
    return {
      billTo: buildBillTo(profile!),
      items: fields.items,
      invoiceDate: fields.invoiceDate,
      dueDate: fields.dueDate,
      currency: fields.currency,
      subtotal, vatAmount, total,
      paymentTerms: fields.paymentTerms,
      otherComments: fields.otherComments,
    };
  }

  function handleSaveDraft(status: 'draft' | 'waiting_approval') {
    const { subtotal, vatAmount, total } = computeTotals(fields.items, fields.vatRate);
    const draft = saveDraft({
      customerName: profile!.customerName,
      billingProfileId: profile!.id,
      billTo: buildBillTo(profile!),
      ...fields,
      subtotal, vatAmount, total,
      status,
    });
    if (status === 'waiting_approval') {
      updateDraftStatus(draft.id, 'waiting_approval');
    }
    if (profile?.id) stampLastInvoiceDate(profile.id);
    setSavedDraft(draft);
    setStep(3);
  }

  const STEPS = ['客户账单资料', '发票内容', '预览确认', '已保存'];

  return (
    <div style={{ margin: '20px 0 32px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 18, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'rgba(203,168,92,0.06)', borderBottom: '1px solid rgba(203,168,92,0.15)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
          <span style={{ fontSize: 11, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.18em' }}>AI ASSISTANT · INVOICE WIZARD</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {/* Step bar */}
      <div style={{ display: 'flex', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === step ? GOLD : i < step ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i === step ? '#000' : i < step ? GOLD_L : MUTED, flexShrink: 0 }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 11.5, color: i === step ? GOLD_L : MUTED, fontWeight: i === step ? 600 : 400, whiteSpace: 'nowrap' }}>{s}</span>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < step ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.06)', margin: '0 12px' }} />}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '24px 24px' }}>
        {step === 0 && <ProfileStep onSelect={handleProfileSelect} />}

        {step === 1 && profile && (
          <InvoiceFormStep
            profile={profile}
            fields={fields}
            onChange={updateFields}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && profile && (
          <div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
              请检查发票内容。确认无误后可保存为草稿，或直接提交审批。
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 24 }}>
              <InvoicePreview draft={buildPreviewDraft()} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>← 修改</button>
              <button onClick={() => handleSaveDraft('draft')} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: TEXT, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>保存为草稿</button>
              <button onClick={() => handleSaveDraft('waiting_approval')} style={{ flex: 2, padding: '10px', borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>提交审批 →</button>
            </div>
          </div>
        )}

        {step === 3 && savedDraft && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
              {savedDraft.status === 'waiting_approval' ? '发票已提交审批' : '草稿已保存'}
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>
              Invoice No: <span style={{ color: GOLD, fontFamily: 'IBM Plex Mono, monospace' }}>{savedDraft.invoiceNo}</span>
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 24 }}>
              客户账单资料已保存。下次为该客户开发票，账单信息将自动带出。
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/invoice" style={{ padding: '10px 24px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: TEXT, fontSize: 13, textDecoration: 'none' }}>查看发票列表</a>
              <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>完成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
