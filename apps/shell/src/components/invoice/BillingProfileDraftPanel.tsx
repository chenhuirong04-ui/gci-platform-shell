// BillingProfileDraftPanel — AI-assisted billing profile creation.
// Step 0 (AI mode only): paste raw text → extract fields via regex
// Step 1: review / edit form + duplicate check
// Step 2: saved confirmation
//
// Saves to Supabase invoice_billing_profiles.
// localStorage is NOT used as source of truth.
import { useState, useEffect } from 'react';
import { colors } from '@gci/design-system';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '@gci/i18n';
import type { BillingProfile } from '../../types/invoice';
import { GCI_COMPANY } from '../../types/invoice';
import { saveProfile, updateProfile, checkDuplicateProfile } from '../../lib/invoiceStore';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const TEXT = colors.textPrimary;
const MUTED = '#8A97B0';  // lifted for readability
const DIM  = '#5A6A84';

// ── Simple regex extraction (V1 — no OCR, no AI) ─────────────────────────────
// Source reference only — does not claim OCR or AI file reading.
interface FormData {
  customerName: string;
  billingName: string;
  billingAddress: string;
  phone: string;
  email: string;
  trn: string;
  country: string;
  city: string;
  defaultCurrency: 'AED' | 'USD' | 'EUR' | 'GBP';
  defaultVatRate: number;
  defaultPaymentTerms: string;
  sourceType: string;
  sourceFileName: string;
  notes: string;
}

function blankForm(): FormData {
  return {
    customerName: '', billingName: '', billingAddress: '',
    phone: '', email: '', trn: '',
    country: 'UAE', city: 'Dubai',
    defaultCurrency: 'AED', defaultVatRate: 5,
    defaultPaymentTerms: GCI_COMPANY.defaultPaymentTerms,
    sourceType: 'Manual', sourceFileName: '', notes: '',
  };
}

function extractFromText(raw: string): Partial<FormData> {
  const result: Partial<FormData> = {};

  // TRN: 15-digit UAE TRN (may be preceded by "TRN" label)
  const trnMatch = raw.match(/(?:TRN|trn)[:\s]*(\d{15})/) ?? raw.match(/\b(\d{15})\b/);
  if (trnMatch) result.trn = trnMatch[1];

  // Phone: +971 ... or +XX ... patterns
  const phoneMatch = raw.match(/(\+971[\s\d\-]{7,13}|\+\d{1,3}[\s\d\-]{8,13})/);
  if (phoneMatch) result.phone = phoneMatch[1].replace(/\s+/g, ' ').trim();

  // Email
  const emailMatch = raw.match(/[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  // Company name: after label keywords
  const nameMatch = raw.match(/(?:公司名|Company Name|Customer Name|Customer)[:\s]+([^\n,]+)/i);
  if (nameMatch) result.customerName = nameMatch[1].trim();

  // Address: after label keywords (grab rest of line)
  const addrMatch = raw.match(/(?:地址|Billing Address|Address)[:\s]+([^\n]+)/i);
  if (addrMatch) result.billingAddress = addrMatch[1].trim();

  // Currency hint
  if (/\bAED\b/.test(raw)) result.defaultCurrency = 'AED';
  else if (/\bUSD\b/.test(raw)) result.defaultCurrency = 'USD';
  else if (/\bEUR\b/.test(raw)) result.defaultCurrency = 'EUR';

  // City / country hints
  if (/\bdubai\b/i.test(raw)) { result.city = 'Dubai'; result.country = 'UAE'; }
  else if (/\babu dhabi\b/i.test(raw)) { result.city = 'Abu Dhabi'; result.country = 'UAE'; }
  else if (/\bsharjah\b/i.test(raw)) { result.city = 'Sharjah'; result.country = 'UAE'; }

  return result;
}

// ── Sub-components ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8,
  padding: '10px 13px', fontSize: 14, color: TEXT,
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12.5, color: MUTED,
  fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.05em',
  marginBottom: 4, display: 'block',
};

function Field({ label, value, onChange, placeholder, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#E0846A' }}> *</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

// ── Duplicate warning ─────────────────────────────────────────────────────────
function DupeWarning({ existing, onUpdate, onCreateNew, onCancel }: {
  existing: BillingProfile;
  onUpdate: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}) {
  const { dict } = useI18n();
  const t = dict.ai.billing;
  return (
    <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: '#D4A843', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, marginBottom: 8 }}>⚠ {t.duplicateTitle}</div>
      <div style={{ fontSize: 14, color: TEXT, marginBottom: 6 }}>
        {t.dupeFoundLabel} <strong>{existing.customerName}</strong>
      </div>
      {existing.trn && <div style={{ fontSize: 13, color: MUTED, fontFamily: 'monospace', marginBottom: 12 }}>TRN: {existing.trn}</div>}
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>{t.dupeQuestion}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onUpdate} style={{ flex: 1, padding: '10px', borderRadius: 7, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          {t.updateExisting}
        </button>
        <button onClick={onCreateNew} style={{ flex: 1, padding: '10px', borderRadius: 7, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: TEXT, fontSize: 14, cursor: 'pointer' }}>
          {t.createNewOne}
        </button>
        <button onClick={onCancel} style={{ padding: '10px 14px', borderRadius: 7, background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>
          {t.cancelBtn}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  /** Raw text from AI input — extracted automatically on open. */
  initialText?: string;
  /** If true, skip the text-paste step and show form directly (e.g. from InvoicePage). */
  directMode?: boolean;
  onClose: () => void;
  onSaved?: (profile: BillingProfile) => void;
}

export function BillingProfileDraftPanel({ initialText = '', directMode = false, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { dict } = useI18n();
  const t = dict.ai.billing;

  // 0 = text paste (AI mode), 1 = review form, 2 = saved
  const [step, setStep] = useState(directMode ? 1 : 0);
  const [rawText, setRawText] = useState(initialText);
  const [form, setForm] = useState<FormData>(() => {
    const base = blankForm();
    if (initialText) return { ...base, ...extractFromText(initialText) };
    return base;
  });

  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState<BillingProfile | null>(null);
  const [dupeChecked, setDupeChecked] = useState(false);
  const [savedProfile, setSavedProfile] = useState<BillingProfile | null>(null);

  // If initialText provided in AI mode, auto-advance to form if extraction found something useful
  useEffect(() => {
    if (!directMode && initialText && (form.customerName || form.trn || form.billingAddress)) {
      setStep(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyExtraction() {
    const extracted = extractFromText(rawText);
    setForm(prev => ({ ...prev, ...extracted }));
    setDupeChecked(false);
    setDupe(null);
    setStep(1);
  }

  function set(key: keyof FormData) {
    return (val: string) => {
      setForm(prev => ({ ...prev, [key]: val }));
      setDupeChecked(false);
      setDupe(null);
    };
  }

  async function handleSave(forceNew = false) {
    if (!form.customerName.trim()) return;
    setSaving(true);

    // Duplicate check (skip if already checked and user chose "create new")
    if (!forceNew && !dupeChecked) {
      const existing = await checkDuplicateProfile(form.customerName, form.trn);
      setDupeChecked(true);
      if (existing) {
        setDupe(existing);
        setSaving(false);
        return;
      }
    }

    setDupe(null);
    const p = await saveProfile({ ...form, status: 'active' }, user?.id);
    setSaving(false);
    setSavedProfile(p);
    setStep(2);
    onSaved?.(p);
  }

  async function handleUpdate() {
    if (!dupe || !form.customerName.trim()) return;
    setSaving(true);
    const updated = await updateProfile(dupe.id, {
      customerName:        form.customerName,
      billingName:         form.billingName,
      billingAddress:      form.billingAddress,
      phone:               form.phone,
      email:               form.email,
      trn:                 form.trn,
    } as any);
    setSaving(false);
    setSavedProfile(updated ?? dupe);
    setDupe(null);
    setStep(2);
    onSaved?.(updated ?? dupe);
  }

  const STEPS = directMode ? t.stepsDirectMode : t.stepsWizardMode;

  const stepIndex = directMode ? (step === 1 ? 0 : 1) : step;

  const canSave = form.customerName.trim().length > 0;

  return (
    <div style={{ margin: '20px 0 32px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 18, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'rgba(203,168,92,0.06)', borderBottom: '1px solid rgba(203,168,92,0.15)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
          <span style={{ fontSize: 13, color: GOLD, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
            {directMode ? t.panelTitle : t.aiPanelTitle}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {/* Step bar */}
      <div style={{ display: 'flex', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === stepIndex ? GOLD : i < stepIndex ? 'rgba(203,168,92,0.4)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === stepIndex ? '#000' : i < stepIndex ? GOLD_L : '#6A7A94', flexShrink: 0 }}>
              {i < stepIndex ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 13, color: i === stepIndex ? GOLD_L : i < stepIndex ? '#7A8EA8' : DIM, fontWeight: i === stepIndex ? 700 : 400, whiteSpace: 'nowrap' }}>{s}</span>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < stepIndex ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.06)', margin: '0 12px' }} />}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '24px 24px' }}>

        {/* Step 0: paste raw text */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 14, color: MUTED, marginBottom: 16 }}>
              {t.pasteHint}
            </div>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={t.pastePlaceholder}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.6 }}
            />
            <div style={{ fontSize: 12, color: DIM, marginTop: 8, marginBottom: 20, fontFamily: 'IBM Plex Mono, monospace' }}>
              {t.sourceRefOnlyNote}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={applyExtraction}
                disabled={!rawText.trim()}
                style={{ flex: 1, padding: '11px', borderRadius: 8, background: rawText.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: rawText.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk',sans-serif" }}
              >{t.extractBtn}</button>
              <button onClick={() => setStep(1)} style={{ padding: '11px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.16)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>{t.skipBtn}</button>
            </div>
          </div>
        )}

        {/* Step 1: review / edit form */}
        {step === 1 && (
          <div>
            {/* Duplicate warning */}
            {dupe && (
              <DupeWarning
                existing={dupe}
                onUpdate={handleUpdate}
                onCreateNew={() => { setDupe(null); handleSave(true); }}
                onCancel={() => { setDupe(null); setSaving(false); }}
              />
            )}

            {/* Extracted hint */}
            {!directMode && rawText && (
              <div style={{ background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13.5, color: '#6FBF8E' }}>
                {t.extractedHint}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t.fieldCustomerName} value={form.customerName} onChange={set('customerName')} placeholder="e.g. IFZA FZCO" required />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t.fieldBillingName} value={form.billingName} onChange={set('billingName')} placeholder={t.fieldBillingNamePlaceholder} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t.fieldBillingAddress} value={form.billingAddress} onChange={set('billingAddress')} placeholder={t.fieldBillingAddressPlaceholder} required />
              </div>
              <Field label={t.fieldTRN} value={form.trn} onChange={set('trn')} placeholder="100xxxxxxx00003" />
              <Field label={t.fieldPhone} value={form.phone} onChange={set('phone')} placeholder="+971 4 xxx xxxx" />
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t.fieldEmail} value={form.email} onChange={set('email')} placeholder="billing@company.com" type="email" />
              </div>
              <Field label={t.fieldCity} value={form.city} onChange={set('city')} placeholder="Dubai" />
              <Field label={t.fieldCountry} value={form.country} onChange={set('country')} placeholder="UAE" />
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{t.fieldDefaultCurrency}</label>
                <select value={form.defaultCurrency} onChange={e => setForm(p => ({ ...p, defaultCurrency: e.target.value as any }))} style={{ ...inputStyle }}>
                  {['AED', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{t.fieldDefaultVatRate}</label>
                <input type="number" value={form.defaultVatRate} min={0} max={100} onChange={e => setForm(p => ({ ...p, defaultVatRate: Number(e.target.value) }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t.fieldDefaultPaymentTerms} value={form.defaultPaymentTerms} onChange={set('defaultPaymentTerms')} placeholder="e.g. 100% before delivery" />
              </div>

              {/* Source reference section */}
              <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: MUTED, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, marginBottom: 10 }}>{t.sourceLabel}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>{t.fieldSourceType}</label>
                    <select value={form.sourceType} onChange={e => setForm(p => ({ ...p, sourceType: e.target.value }))} style={inputStyle}>
                      {['Manual', 'PDF', 'WhatsApp', 'Email', 'Screenshot', 'Other'].map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <Field label={t.fieldSourceFileName} value={form.sourceFileName} onChange={set('sourceFileName')} placeholder="e.g. IFZA invoice.pdf" />
                </div>
                <Field label={t.fieldNotes} value={form.notes} onChange={set('notes')} placeholder="e.g. Seeded from INV-000143" />
                <div style={{ fontSize: 12, color: DIM, fontFamily: 'IBM Plex Mono, monospace' }}>
                  {t.sourceRefOnlyNote}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {!directMode && <button onClick={() => setStep(0)} style={{ padding: '11px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.16)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>{t.backBtn}</button>}
              <button onClick={onClose} style={{ padding: '11px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.16)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>{t.cancelBtn}</button>
              <button
                onClick={() => handleSave(false)}
                disabled={!canSave || saving}
                style={{ flex: 1, padding: '11px', borderRadius: 8, background: canSave && !saving ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk',sans-serif" }}
              >{saving ? t.savingBtn : t.saveBtn}</button>
            </div>
          </div>
        )}

        {/* Step 2: saved */}
        {step === 2 && savedProfile && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: TEXT, marginBottom: 8 }}>{t.savedTitle}</div>
            <div style={{ fontSize: 13.5, color: GOLD, marginBottom: 6 }}>{savedProfile.customerName}</div>
            {savedProfile.trn && <div style={{ fontSize: 13, color: MUTED, fontFamily: 'monospace', marginBottom: 6 }}>TRN: {savedProfile.trn}</div>}
            <div style={{ fontSize: 13.5, color: MUTED, marginBottom: 8 }}>
              {t.savedHint}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, background: 'rgba(111,191,142,0.10)', border: '1px solid rgba(111,191,142,0.3)', marginBottom: 24 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6FBF8E' }} />
              <span style={{ fontSize: 12, color: '#6FBF8E', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.06em' }}>{t.cloudSyncTeamShared}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/invoice?tab=profiles" style={{ padding: '11px 24px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: TEXT, fontSize: 14, textDecoration: 'none' }}>{t.viewLibraryBtn}</a>
              <button onClick={onClose} style={{ padding: '11px 24px', borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>{t.doneBtn}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
