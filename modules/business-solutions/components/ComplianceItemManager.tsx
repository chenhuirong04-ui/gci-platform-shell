import React, { useState, useEffect } from 'react';
import type { BSLang } from '../types';
import type { ComplianceItem } from '../lib/bsCloud';
import { listComplianceItems, saveComplianceItem, updateComplianceItem, deleteComplianceItem } from '../lib/bsCloud';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

// ── Compliance types ────────────────────────────────────────────────────────
const COMPLIANCE_TYPES = [
  { key: 'TRADE_LICENSE',             zh: '营业执照',         en: 'Trade License' },
  { key: 'LICENSE_RENEWAL',           zh: '牌照续期',         en: 'License Renewal' },
  { key: 'ANNUAL_REVIEW',             zh: '年审',             en: 'Annual Review' },
  { key: 'VAT_REGISTRATION',          zh: 'VAT注册',          en: 'VAT Registration' },
  { key: 'VAT_FILING',                zh: 'VAT申报',          en: 'VAT Filing' },
  { key: 'CORPORATE_TAX_REGISTRATION',zh: '企业所得税注册',   en: 'Corporate Tax Registration' },
  { key: 'CORPORATE_TAX_FILING',      zh: '企业所得税申报',   en: 'Corporate Tax Filing' },
  { key: 'AUDIT',                     zh: '审计',             en: 'Audit' },
  { key: 'WORK_VISA',                 zh: '工作签证',         en: 'Work Visa' },
  { key: 'INVESTOR_VISA',             zh: '投资签证',         en: 'Investor Visa' },
  { key: 'FAMILY_VISA',               zh: '家庭签证',         en: 'Family Visa' },
  { key: 'EMIRATES_ID',               zh: 'Emirates ID',      en: 'Emirates ID' },
  { key: 'INSURANCE',                 zh: '保险',             en: 'Insurance' },
  { key: 'CONTRACT_RENEWAL',          zh: '合同续约',         en: 'Contract Renewal' },
  { key: 'OTHER',                     zh: '其他',             en: 'Other' },
];

const FILING_FREQ = [
  { key: 'monthly',   zh: '每月', en: 'Monthly' },
  { key: 'quarterly', zh: '每季', en: 'Quarterly' },
  { key: 'biannual',  zh: '半年', en: 'Bi-annual' },
  { key: 'annual',    zh: '每年', en: 'Annual' },
  { key: 'one_time',  zh: '一次性', en: 'One-time' },
];

const REMINDER_OPTIONS = [30, 60, 90];

// ── Expiry helpers ──────────────────────────────────────────────────────────
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

type ExpiryLevel = 'expired' | 'critical' | 'warning' | 'soon' | 'ok' | 'none';

function expiryLevel(item: ComplianceItem): ExpiryLevel {
  const d = daysUntil(item.expiry_date ?? item.next_due_date);
  if (d === null) return 'none';
  if (d < 0)   return 'expired';
  if (d <= 30) return 'critical';
  if (d <= 60) return 'warning';
  if (d <= 90) return 'soon';
  return 'ok';
}

const LEVEL_STYLE: Record<ExpiryLevel, { bg: string; text: string; zh: string; en: string }> = {
  expired:  { bg: '#FEE2E2', text: '#B91C1C', zh: '已过期',    en: 'Expired' },
  critical: { bg: '#FED7AA', text: '#C2410C', zh: '30天内到期', en: '≤30 days' },
  warning:  { bg: '#FEF9C3', text: '#854D0E', zh: '60天内到期', en: '≤60 days' },
  soon:     { bg: '#FEF3C7', text: '#92400E', zh: '90天内到期', en: '≤90 days' },
  ok:       { bg: '#DCFCE7', text: '#166534', zh: '正常',       en: 'Valid' },
  none:     { bg: '#F3F4F6', text: '#6B7280', zh: '无到期日',   en: 'No expiry' },
};

// ── Field visibility by type ───────────────────────────────────────────────
function showsLicenseFields(type: string) {
  return ['TRADE_LICENSE', 'LICENSE_RENEWAL', 'ANNUAL_REVIEW'].includes(type);
}
function showsVisaFields(type: string) {
  return ['WORK_VISA', 'INVESTOR_VISA', 'FAMILY_VISA', 'EMIRATES_ID'].includes(type);
}
function showsFilingFields(type: string) {
  return ['VAT_FILING', 'CORPORATE_TAX_FILING', 'VAT_REGISTRATION', 'CORPORATE_TAX_REGISTRATION', 'AUDIT'].includes(type);
}

// ── Empty form factory ─────────────────────────────────────────────────────
function emptyItem(customerId: string, docId?: string, defaults?: Partial<ComplianceItem>): ComplianceItem {
  return {
    customer_id: customerId,
    document_id: docId,
    compliance_type: 'TRADE_LICENSE',
    title: '',
    reminder_days: 30,
    status: 'ACTIVE',
    activities: [],
    ...defaults,
  };
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  customerId: string;
  lang: BSLang;
  /** Pre-open form for a newly uploaded document */
  prefillFromDocument?: {
    documentId: string;
    documentType: string;
    documentName: string;
  };
  onPrefillHandled?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export function ComplianceItemManager({ customerId, lang, prefillFromDocument, onPrefillHandled }: Props) {
  const isZh = lang === 'zh';

  const [items, setItems]         = useState<ComplianceItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<ComplianceItem | null>(null);
  const [form, setForm]           = useState<ComplianceItem>(emptyItem(customerId));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [activityInput, setActivityInput] = useState('');

  useEffect(() => { load(); }, [customerId]);

  // Handle prefill from document upload
  useEffect(() => {
    if (!prefillFromDocument) return;
    const typeMap: Record<string, string> = {
      '营业执照': 'TRADE_LICENSE', 'Trade License': 'TRADE_LICENSE',
      '合同': 'CONTRACT_RENEWAL', 'Contract': 'CONTRACT_RENEWAL',
      'VAT Certificate': 'VAT_REGISTRATION',
      'Corporate Tax Certificate': 'CORPORATE_TAX_REGISTRATION',
      '护照': 'OTHER', 'Passport': 'WORK_VISA',
      'Emirates ID': 'EMIRATES_ID',
    };
    const guessedType = typeMap[prefillFromDocument.documentType] || 'OTHER';
    setForm(emptyItem(customerId, prefillFromDocument.documentId, {
      compliance_type: guessedType,
      title: prefillFromDocument.documentName,
    }));
    setEditItem(null);
    setShowForm(true);
    setError('');
    onPrefillHandled?.();
  }, [prefillFromDocument]);

  const load = async () => {
    setLoading(true);
    const data = await listComplianceItems(customerId);
    setItems(data);
    setLoading(false);
  };

  const openAdd = () => {
    setEditItem(null);
    setForm(emptyItem(customerId));
    setActivityInput('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (item: ComplianceItem) => {
    setEditItem(item);
    setForm({ ...item, activities: item.activities || [] });
    setActivityInput('');
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError(isZh ? '请填写事项名称' : 'Please enter a title');
      return;
    }
    setError('');
    setSaving(true);
    const payload = { ...form, title: form.title.trim() };
    if (editItem?.id) {
      await updateComplianceItem(editItem.id, payload);
      setItems(prev => prev.map(x => x.id === editItem.id ? { ...x, ...payload } : x));
    } else {
      const saved = await saveComplianceItem(payload);
      if (saved) setItems(prev => [...prev, saved]);
    }
    setSaving(false);
    setShowForm(false);
  };

  const handleDelete = async (item: ComplianceItem) => {
    if (!window.confirm(isZh ? `确定删除「${item.title}」？` : `Delete "${item.title}"?`)) return;
    if (item.id) await deleteComplianceItem(item.id);
    setItems(prev => prev.filter(x => x.id !== item.id));
  };

  const addActivity = () => {
    const val = activityInput.trim();
    if (!val) return;
    setForm(v => ({ ...v, activities: [...(v.activities || []), val] }));
    setActivityInput('');
  };

  const removeActivity = (idx: number) => {
    setForm(v => ({ ...v, activities: (v.activities || []).filter((_, i) => i !== idx) }));
  };

  const typeLabel = (key: string) => {
    const t = COMPLIANCE_TYPES.find(x => x.key === key);
    return t ? (isZh ? t.zh : t.en) : key;
  };

  // ── Alerts summary ─────────────────────────────────────────────────────
  const alerts = items.filter(x => ['expired', 'critical', 'warning'].includes(expiryLevel(x)));

  // ── Input style ────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #d1d9e0', fontSize: 13,
    color: '#17233C', background: 'white', outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 5 };

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">{isZh ? '加载中…' : 'Loading…'}</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
            {isZh ? '证照与合规' : 'Licenses & Compliance'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{items.length} {isZh ? '项事项' : 'items'}</div>
        </div>
        <button onClick={openAdd} className="text-sm font-black px-4 py-2 rounded-xl text-white" style={{ background: NAVY }}>
          + {isZh ? '新增事项' : 'Add Item'}
        </button>
      </div>

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="font-bold text-red-700 mb-1">
            ⚠️ {isZh ? `${alerts.length} 项合规事项需要关注` : `${alerts.length} compliance item(s) need attention`}
          </div>
          {alerts.map(a => {
            const d = daysUntil(a.expiry_date ?? a.next_due_date);
            const lvl = expiryLevel(a);
            const s = LEVEL_STYLE[lvl];
            return (
              <div key={a.id} className="flex items-center gap-2 mt-1 text-xs">
                <span className="font-bold" style={{ color: s.text }}>
                  {typeLabel(a.compliance_type)}
                </span>
                <span className="text-gray-600">{a.title}</span>
                <span className="ml-auto font-bold" style={{ color: s.text }}>
                  {d !== null && d < 0 ? (isZh ? `已过期 ${Math.abs(d)} 天` : `Expired ${Math.abs(d)}d ago`)
                    : d !== null ? (isZh ? `还剩 ${d} 天` : `${d}d left`)
                    : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {editItem ? (isZh ? '编辑合规事项' : 'Edit Compliance Item') : (isZh ? '新增合规事项' : 'New Compliance Item')}
            </p>
            <button onClick={() => setShowForm(false)} style={{ color: '#8a9ab0', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Type + Title */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div>
                <label style={lbl}>{isZh ? '合规类型' : 'Type'}<span style={{ color: '#e53e3e', marginLeft: 3 }}>*</span></label>
                <select style={{ ...inp }} value={form.compliance_type}
                  onChange={e => setForm(v => ({ ...v, compliance_type: e.target.value }))}>
                  {COMPLIANCE_TYPES.map(t => (
                    <option key={t.key} value={t.key}>{isZh ? t.zh : t.en}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>{isZh ? '事项名称' : 'Title'}<span style={{ color: '#e53e3e', marginLeft: 3 }}>*</span></label>
                <input style={{ ...inp, borderColor: error && !form.title ? '#e53e3e' : '#d1d9e0' }}
                  placeholder={isZh ? '如：GCI营业执照 2024' : 'e.g. GCI Trade License 2024'}
                  value={form.title}
                  onChange={e => setForm(v => ({ ...v, title: e.target.value }))} />
              </div>
            </div>

            {/* License-specific fields */}
            {showsLicenseFields(form.compliance_type) && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>{isZh ? '执照号码' : 'License No.'}</label>
                    <input style={inp} placeholder="CN-XXXXX"
                      value={form.license_number || ''} onChange={e => setForm(v => ({ ...v, license_number: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Licensee</label>
                    <input style={inp} placeholder="Company legal name"
                      value={form.licensee_name || ''} onChange={e => setForm(v => ({ ...v, licensee_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Trade Name</label>
                    <input style={inp} placeholder="Trading as..."
                      value={form.trade_name || ''} onChange={e => setForm(v => ({ ...v, trade_name: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Legal Status</label>
                    <input style={inp} placeholder="LLC / FZ-LLC / Sole Prop..."
                      value={form.legal_status || ''} onChange={e => setForm(v => ({ ...v, legal_status: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Issuing Authority</label>
                    <input style={inp} placeholder="DED / DMCC / IFZA..."
                      value={form.issuing_authority || ''} onChange={e => setForm(v => ({ ...v, issuing_authority: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Company Manager</label>
                    <input style={inp} placeholder="Manager name"
                      value={form.manager_name || ''} onChange={e => setForm(v => ({ ...v, manager_name: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Premises No.</label>
                    <input style={inp} value={form.premises_number || ''}
                      onChange={e => setForm(v => ({ ...v, premises_number: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Building</label>
                    <input style={inp} value={form.building_name || ''}
                      onChange={e => setForm(v => ({ ...v, building_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Area</label>
                    <input style={inp} value={form.area_name || ''}
                      onChange={e => setForm(v => ({ ...v, area_name: e.target.value }))} />
                  </div>
                </div>
                {/* Activities */}
                <div>
                  <label style={lbl}>{isZh ? '经营活动' : 'Business Activities'}</label>
                  <div className="flex gap-2 mb-2">
                    <input style={{ ...inp, flex: 1 }} placeholder={isZh ? '输入活动名称后按添加' : 'Enter activity then click Add'}
                      value={activityInput} onChange={e => setActivityInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addActivity())} />
                    <button onClick={addActivity} style={{ padding: '10px 16px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      {isZh ? '添加' : 'Add'}
                    </button>
                  </div>
                  {(form.activities || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(form.activities || []).map((act, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                          style={{ background: `${NAVY}10`, color: NAVY }}>
                          {act}
                          <button onClick={() => removeActivity(i)} style={{ color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Visa-specific fields */}
            {showsVisaFields(form.compliance_type) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>{isZh ? '证件号码 / UID' : 'ID / UID Number'}</label>
                  <input style={inp} value={form.license_number || ''}
                    onChange={e => setForm(v => ({ ...v, license_number: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>{isZh ? '持证人姓名' : 'Holder Name'}</label>
                  <input style={inp} value={form.licensee_name || ''}
                    onChange={e => setForm(v => ({ ...v, licensee_name: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Filing-specific fields */}
            {showsFilingFields(form.compliance_type) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>{isZh ? '申报频率' : 'Filing Frequency'}</label>
                  <select style={inp} value={form.filing_frequency || ''}
                    onChange={e => setForm(v => ({ ...v, filing_frequency: e.target.value }))}>
                    <option value="">—</option>
                    {FILING_FREQ.map(f => <option key={f.key} value={f.key}>{isZh ? f.zh : f.en}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>{isZh ? '下次申报日' : 'Next Due Date'}</label>
                  <input type="date" style={inp} value={form.next_due_date || ''}
                    onChange={e => setForm(v => ({ ...v, next_due_date: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Common date fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>{isZh ? '签发日期' : 'Issue Date'}</label>
                <input type="date" style={inp} value={form.issue_date || ''}
                  onChange={e => setForm(v => ({ ...v, issue_date: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '到期日期' : 'Expiry Date'}</label>
                <input type="date" style={inp} value={form.expiry_date || ''}
                  onChange={e => setForm(v => ({ ...v, expiry_date: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '续期日期' : 'Renewal Date'}</label>
                <input type="date" style={inp} value={form.renewal_date || ''}
                  onChange={e => setForm(v => ({ ...v, renewal_date: e.target.value }))} />
              </div>
            </div>

            {/* Reminder + Assigned + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>{isZh ? '提醒天数' : 'Remind (days before)'}</label>
                <select style={inp} value={form.reminder_days || 30}
                  onChange={e => setForm(v => ({ ...v, reminder_days: Number(e.target.value) }))}>
                  {REMINDER_OPTIONS.map(n => <option key={n} value={n}>{n} {isZh ? '天' : 'days'}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{isZh ? '负责人' : 'Assigned To'}</label>
                <input style={inp} placeholder="Chris / Lili / Novie"
                  value={form.assigned_to || ''} onChange={e => setForm(v => ({ ...v, assigned_to: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '状态' : 'Status'}</label>
                <select style={inp} value={form.status || 'ACTIVE'}
                  onChange={e => setForm(v => ({ ...v, status: e.target.value }))}>
                  <option value="ACTIVE">{isZh ? '有效' : 'Active'}</option>
                  <option value="EXPIRED">{isZh ? '已过期' : 'Expired'}</option>
                  <option value="RENEWED">{isZh ? '已续期' : 'Renewed'}</option>
                  <option value="CANCELLED">{isZh ? '已取消' : 'Cancelled'}</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={lbl}>{isZh ? '备注' : 'Notes'}</label>
              <textarea style={{ ...inp, resize: 'none', minHeight: 64, lineHeight: 1.6 }}
                placeholder={isZh ? '其他备注…' : 'Additional notes…'}
                value={form.notes || ''} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} />
            </div>

            {error && (
              <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c53030', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: NAVY, color: 'white' }}>
                {saving ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存事项' : 'Save Item')}
              </button>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1.5px solid #d1d9e0', background: 'white', color: '#5a6a82' }}>
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">🏢</div>
          <div className="text-sm text-gray-500 font-medium">{isZh ? '暂无合规事项' : 'No compliance items yet'}</div>
          <div className="text-xs text-gray-400 mt-1">
            {isZh ? '点击「新增事项」添加营业执照、VAT申报、签证等' : 'Add trade licenses, VAT filings, visas and more'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const lvl = expiryLevel(item);
            const s = LEVEL_STYLE[lvl];
            const d = daysUntil(item.expiry_date ?? item.next_due_date);
            const dateField = item.expiry_date ?? item.next_due_date;
            return (
              <div key={item.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e8e0d0', background: 'white' }}>
                <div className="flex items-start gap-3 p-4">
                  {/* Status stripe */}
                  <div className="flex-shrink-0 w-1 self-stretch rounded-full" style={{ background: s.text }} />

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: `${NAVY}10`, color: NAVY }}>
                        {typeLabel(item.compliance_type)}
                      </span>
                      <span className="font-bold text-sm" style={{ color: NAVY }}>{item.title}</span>
                      {dateField && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-auto" style={{ background: s.bg, color: s.text }}>
                          {d !== null && d < 0
                            ? (isZh ? `逾期 ${Math.abs(d)}天` : `Overdue ${Math.abs(d)}d`)
                            : d !== null
                            ? (isZh ? `还剩 ${d}天` : `${d}d left`)
                            : (isZh ? s.zh : s.en)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-1">
                      {item.license_number && <span>{isZh ? '编号' : 'No.'}: <span className="font-mono text-gray-600">{item.license_number}</span></span>}
                      {item.licensee_name && <span>Licensee: <span className="text-gray-600">{item.licensee_name}</span></span>}
                      {item.issuing_authority && <span>{isZh ? '发证机关' : 'Authority'}: <span className="text-gray-600">{item.issuing_authority}</span></span>}
                      {item.issue_date && <span>{isZh ? '签发' : 'Issued'}: {item.issue_date}</span>}
                      {item.expiry_date && <span>{isZh ? '到期' : 'Expires'}: <span className="font-medium" style={{ color: lvl !== 'ok' && lvl !== 'none' ? s.text : '#374151' }}>{item.expiry_date}</span></span>}
                      {item.next_due_date && <span>{isZh ? '下次申报' : 'Next due'}: {item.next_due_date}</span>}
                      {item.assigned_to && <span>{isZh ? '负责人' : 'Owner'}: {item.assigned_to}</span>}
                    </div>

                    {(item.activities || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(item.activities || []).slice(0, 4).map((a, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f3f4f6', color: '#6b7280' }}>{a}</span>
                        ))}
                        {(item.activities || []).length > 4 && (
                          <span className="text-[10px] text-gray-400">+{(item.activities || []).length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(item)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                      style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      {isZh ? '编辑' : 'Edit'}
                    </button>
                    <button onClick={() => handleDelete(item)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                      style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                      {isZh ? '删除' : 'Del'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
