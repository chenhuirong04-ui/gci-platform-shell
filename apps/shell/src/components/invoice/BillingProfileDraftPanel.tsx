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
import type { BillingProfile } from '../../types/invoice';
import { GCI_COMPANY } from '../../types/invoice';
import { saveProfile, updateProfile, checkDuplicateProfile } from '../../lib/invoiceStore';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const TEXT = colors.textPrimary;
const MUTED = '#505A70';

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
  width: '100%', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: TEXT,
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: MUTED,
  fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em',
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
  return (
    <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: '#D4A843', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.12em', marginBottom: 8 }}>⚠ DUPLICATE FOUND</div>
      <div style={{ fontSize: 13, color: TEXT, marginBottom: 4 }}>
        已找到相同客户开票资料：<strong>{existing.customerName}</strong>
      </div>
      {existing.trn && <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace', marginBottom: 12 }}>TRN: {existing.trn}</div>}
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>是否更新现有资料，还是新建一条？</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onUpdate} style={{ flex: 1, padding: '8px', borderRadius: 7, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          更新现有资料
        </button>
        <button onClick={onCreateNew} style={{ flex: 1, padding: '8px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: TEXT, fontSize: 12, cursor: 'pointer' }}>
          新建一条
        </button>
        <button onClick={onCancel} style={{ padding: '8px 14px', borderRadius: 7, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: MUTED, fontSize: 12, cursor: 'pointer' }}>
          取消
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

  const STEPS = directMode
    ? ['填写开票资料', '已保存']
    : ['粘贴原始信息', '确认 / 编辑', '已保存'];

  const stepIndex = directMode ? (step === 1 ? 0 : 1) : step;

  const canSave = form.customerName.trim().length > 0;

  return (
    <div style={{ margin: '20px 0 32px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 18, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'rgba(203,168,92,0.06)', borderBottom: '1px solid rgba(203,168,92,0.15)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
          <span style={{ fontSize: 11, color: GOLD, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.18em' }}>
            {directMode ? 'BILLING PROFILE LIBRARY · NEW PROFILE' : 'AI ASSISTANT · SAVE BILLING PROFILE'}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {/* Step bar */}
      <div style={{ display: 'flex', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === stepIndex ? GOLD : i < stepIndex ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i === stepIndex ? '#000' : i < stepIndex ? GOLD_L : MUTED, flexShrink: 0 }}>
              {i < stepIndex ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 11.5, color: i === stepIndex ? GOLD_L : MUTED, fontWeight: i === stepIndex ? 600 : 400, whiteSpace: 'nowrap' }}>{s}</span>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < stepIndex ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.06)', margin: '0 12px' }} />}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '24px 24px' }}>

        {/* Step 0: paste raw text */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
              将客户开票信息粘贴到下方。系统会自动识别公司名、地址、TRN、电话等字段。
            </div>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={'帮我把这个客户的开票资料存起来：\n\n公司名 IFZA FZCO\n地址 DSO-IFZA, Dubai Digital Park...\n电话 +971 4 228 5285\nTRN 100442089700003'}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.6 }}
            />
            <div style={{ fontSize: 11, color: '#3A4255', marginTop: 8, marginBottom: 20, fontFamily: 'IBM Plex Mono, monospace' }}>
              Source reference only. File / OCR extraction not connected in V1.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={applyExtraction}
                disabled={!rawText.trim()}
                style={{ flex: 1, padding: '10px', borderRadius: 8, background: rawText.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: rawText.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk',sans-serif" }}
              >识别并填写字段 →</button>
              <button onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>跳过 / 手动填写</button>
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
              <div style={{ background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#6FBF8E' }}>
                ✓ 已从文字中自动识别部分字段，请检查并补充缺失内容
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Customer Name" value={form.customerName} onChange={set('customerName')} placeholder="e.g. IFZA FZCO" required />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Billing Name (if different)" value={form.billingName} onChange={set('billingName')} placeholder="Leave blank if same as customer name" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Billing Address" value={form.billingAddress} onChange={set('billingAddress')} placeholder="Full billing address" required />
              </div>
              <Field label="TRN" value={form.trn} onChange={set('trn')} placeholder="100xxxxxxx00003" />
              <Field label="Phone" value={form.phone} onChange={set('phone')} placeholder="+971 4 xxx xxxx" />
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Email" value={form.email} onChange={set('email')} placeholder="billing@company.com" type="email" />
              </div>
              <Field label="City" value={form.city} onChange={set('city')} placeholder="Dubai" />
              <Field label="Country" value={form.country} onChange={set('country')} placeholder="UAE" />
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Default Currency</label>
                <select value={form.defaultCurrency} onChange={e => setForm(p => ({ ...p, defaultCurrency: e.target.value as any }))} style={{ ...inputStyle }}>
                  {['AED', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Default VAT Rate (%)</label>
                <input type="number" value={form.defaultVatRate} min={0} max={100} onChange={e => setForm(p => ({ ...p, defaultVatRate: Number(e.target.value) }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Default Payment Terms" value={form.defaultPaymentTerms} onChange={set('defaultPaymentTerms')} placeholder="e.g. 100% before delivery" />
              </div>

              {/* Source reference section */}
              <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: MUTED, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.12em', marginBottom: 10 }}>SOURCE REFERENCE (OPTIONAL)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Source Type</label>
                    <select value={form.sourceType} onChange={e => setForm(p => ({ ...p, sourceType: e.target.value }))} style={inputStyle}>
                      {['Manual', 'PDF', 'WhatsApp', 'Email', 'Screenshot', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <Field label="Source File Name" value={form.sourceFileName} onChange={set('sourceFileName')} placeholder="e.g. IFZA invoice.pdf" />
                </div>
                <Field label="Notes" value={form.notes} onChange={set('notes')} placeholder="e.g. Seeded from INV-000143" />
                <div style={{ fontSize: 10.5, color: '#3A4255', fontFamily: 'IBM Plex Mono, monospace' }}>
                  Source reference only. File storage / OCR not connected in V1.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {!directMode && <button onClick={() => setStep(0)} style={{ padding: '10px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>← 返回</button>}
              <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>取消</button>
              <button
                onClick={() => handleSave(false)}
                disabled={!canSave || saving}
                style={{ flex: 1, padding: '10px', borderRadius: 8, background: canSave && !saving ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk',sans-serif" }}
              >{saving ? '保存中…' : '保存开票资料'}</button>
            </div>
          </div>
        )}

        {/* Step 2: saved */}
        {step === 2 && savedProfile && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: TEXT, marginBottom: 8 }}>开票资料已保存</div>
            <div style={{ fontSize: 13.5, color: GOLD, marginBottom: 6 }}>{savedProfile.customerName}</div>
            {savedProfile.trn && <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace', marginBottom: 6 }}>TRN: {savedProfile.trn}</div>}
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              已存入 Supabase，迪拜和中国团队均可在发票向导中直接选用。
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 20, background: 'rgba(111,191,142,0.10)', border: '1px solid rgba(111,191,142,0.3)', marginBottom: 24 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6FBF8E' }} />
              <span style={{ fontSize: 10.5, color: '#6FBF8E', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em' }}>Cloud Sync: Connected — 团队共享</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/invoice?tab=profiles" style={{ padding: '10px 24px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: TEXT, fontSize: 13, textDecoration: 'none' }}>查看账单资料库</a>
              <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>完成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
