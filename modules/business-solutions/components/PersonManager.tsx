/**
 * PersonManager — Company Persons (公司人员)
 * Manages legal reps, shareholders, managers, visa holders per customer.
 * Can accept prefill from AI-parsed document (passport / EID / visa).
 */
import React, { useState, useEffect } from 'react';
import type { BSLang } from '../types';
import type { CustomerPerson } from '../lib/bsCloud';
import { listPersons, savePerson, updatePerson, deletePerson } from '../lib/bsCloud';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

const ROLES_ZH = ['法定代表人', '股东', '董事', '经理人', '签证持有人', '授权人', '其他'];
const ROLES_EN = ['Legal Representative', 'Shareholder', 'Director', 'Manager', 'Visa Holder', 'Authorized Person', 'Other'];

function daysUntil(d?: string): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

type Level = 'expired' | 'critical' | 'warning' | 'soon' | 'ok' | 'none';
function level(d?: string): Level {
  const days = daysUntil(d);
  if (days === null) return 'none';
  if (days < 0)   return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 60) return 'warning';
  if (days <= 90) return 'soon';
  return 'ok';
}
const BADGE = {
  expired:  { bg: '#FEE2E2', text: '#B91C1C' },
  critical: { bg: '#FED7AA', text: '#C2410C' },
  warning:  { bg: '#FEF9C3', text: '#854D0E' },
  soon:     { bg: '#FEF3C7', text: '#92400E' },
  ok:       { bg: '#DCFCE7', text: '#166534' },
  none:     { bg: '#F3F4F6', text: '#6B7280' },
};

interface ParsedData {
  full_name?: string;
  nationality?: string;
  passport_number?: string;
  passport_expiry_date?: string;
  emirates_id_number?: string;
  emirates_id_expiry_date?: string;
  uid_number?: string;
  visa_number?: string;
  visa_type?: string;
  visa_expiry_date?: string;
  date_of_birth?: string;
  confidence?: string;
}

interface Props {
  customerId: string;
  lang: BSLang;
  /** Pre-open form with data from AI-parsed document */
  prefillFromDocument?: {
    documentId: string;
    documentType: string;
    documentName: string;
    parsed: ParsedData;
  } | null;
  onPrefillHandled?: () => void;
}

function emptyPerson(customerId: string): CustomerPerson {
  return {
    customer_id: customerId,
    full_name: '',
    role: '',
    nationality: '',
    passport_number: '',
    passport_expiry_date: '',
    emirates_id_number: '',
    emirates_id_expiry_date: '',
    uid_number: '',
    visa_number: '',
    visa_type: '',
    visa_expiry_date: '',
    date_of_birth: '',
    shareholding_percentage: undefined,
    is_legal_representative: false,
    is_manager: false,
    phone: '',
    email: '',
    notes: '',
  };
}

function parsedToForm(customerId: string, parsed: ParsedData, docType: string): CustomerPerson {
  const base = emptyPerson(customerId);
  return {
    ...base,
    full_name:               parsed.full_name               || '',
    nationality:             parsed.nationality             || '',
    passport_number:         parsed.passport_number         || '',
    passport_expiry_date:    parsed.passport_expiry_date    || '',
    emirates_id_number:      parsed.emirates_id_number      || '',
    emirates_id_expiry_date: parsed.emirates_id_expiry_date || '',
    uid_number:              parsed.uid_number              || '',
    visa_number:             parsed.visa_number             || '',
    visa_type:               parsed.visa_type               || '',
    visa_expiry_date:        parsed.visa_expiry_date        || '',
    date_of_birth:           parsed.date_of_birth           || '',
    role: docType === 'PASSPORT'
      ? 'Visa Holder'
      : docType === 'EMIRATES_ID'
      ? 'Authorized Person'
      : docType?.includes('VISA')
      ? 'Visa Holder'
      : '',
  };
}

export function PersonManager({ customerId, lang, prefillFromDocument, onPrefillHandled }: Props) {
  const isZh = lang === 'zh';

  const [persons, setPersons]       = useState<CustomerPerson[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<CustomerPerson>(emptyPerson(customerId));
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [prefillSource, setPrefillSource] = useState('');

  useEffect(() => { load(); }, [customerId]);

  // Handle incoming prefill from document upload
  useEffect(() => {
    if (!prefillFromDocument) return;
    const p = prefillFromDocument;
    setForm(parsedToForm(customerId, p.parsed, p.documentType));
    setPrefillSource(p.documentName);
    setEditId(null);
    setError('');
    setShowForm(true);
    onPrefillHandled?.();
  }, [prefillFromDocument]);

  const load = async () => {
    setLoading(true);
    const data = await listPersons(customerId);
    setPersons(data);
    setLoading(false);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyPerson(customerId));
    setPrefillSource('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (p: CustomerPerson) => {
    setEditId(p.id || null);
    setForm({ ...p });
    setPrefillSource('');
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError(isZh ? '请填写姓名' : 'Full name is required');
      return;
    }
    setError('');
    setSaving(true);
    const payload: CustomerPerson = {
      ...form,
      full_name:               form.full_name.trim(),
      passport_expiry_date:    form.passport_expiry_date    || undefined,
      emirates_id_expiry_date: form.emirates_id_expiry_date || undefined,
      visa_expiry_date:        form.visa_expiry_date        || undefined,
      date_of_birth:           form.date_of_birth           || undefined,
      shareholding_percentage: form.shareholding_percentage  || undefined,
    };

    if (editId) {
      await updatePerson(editId, payload);
      setPersons(prev => prev.map(p => p.id === editId ? { ...p, ...payload } : p));
    } else {
      const saved = await savePerson(payload);
      if (saved) setPersons(prev => [saved, ...prev]);
    }
    setSaving(false);
    setShowForm(false);
  };

  const handleDelete = async (p: CustomerPerson) => {
    if (!window.confirm(isZh ? `确定删除「${p.full_name}」？` : `Delete "${p.full_name}"?`)) return;
    if (p.id) await deletePerson(p.id);
    setPersons(prev => prev.filter(x => x.id !== p.id));
  };

  const inp: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d9e0',
    fontSize: 13, color: '#17233C', background: 'white', outline: 'none',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 5,
  };
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">{isZh ? '加载中…' : 'Loading…'}</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>
            {isZh ? '公司人员' : 'Company Persons'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {persons.length} {isZh ? '位人员' : 'persons'}
          </div>
        </div>
        <button onClick={openAdd} className="text-sm font-black px-4 py-2 rounded-xl text-white" style={{ background: NAVY }}>
          + {isZh ? '新增人员' : 'Add Person'}
        </button>
      </div>

      {/* Expiry alerts */}
      {persons.some(p => {
        const d = Math.min(
          daysUntil(p.passport_expiry_date) ?? 9999,
          daysUntil(p.emirates_id_expiry_date) ?? 9999,
          daysUntil(p.visa_expiry_date) ?? 9999,
        );
        return d <= 30;
      }) && (
        <div className="mb-4 p-3 rounded-xl text-xs" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="font-black text-red-700 mb-1.5">
            🔔 {isZh ? '以下人员证件将于30天内到期或已过期' : 'Documents expiring within 30 days'}
          </div>
          <div className="flex flex-wrap gap-2">
            {persons.filter(p => {
              const d = Math.min(
                daysUntil(p.passport_expiry_date) ?? 9999,
                daysUntil(p.emirates_id_expiry_date) ?? 9999,
                daysUntil(p.visa_expiry_date) ?? 9999,
              );
              return d <= 30;
            }).map(p => (
              <span key={p.id} className="px-2 py-0.5 rounded font-bold" style={{ background: '#FED7AA', color: '#C2410C' }}>
                {p.full_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                {editId ? (isZh ? '编辑人员资料' : 'Edit Person') : (isZh ? '新增人员' : 'Add Person')}
              </p>
              {prefillSource && (
                <p style={{ fontSize: 11, color: '#8a6d1c', marginTop: 2 }}>
                  ✦ {isZh ? `AI 已从「${prefillSource}」识别字段，请确认后保存` : `AI extracted from "${prefillSource}" — please verify`}
                </p>
              )}
            </div>
            <button onClick={() => { setShowForm(false); setError(''); }}
              style={{ color: '#8a9ab0', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Basic */}
            <div style={grid3}>
              <div>
                <label style={lbl}>{isZh ? '姓名' : 'Full Name'} <span style={{ color: '#e53e3e' }}>*</span></label>
                <input style={{ ...inp, borderColor: error && !form.full_name ? '#e53e3e' : '#d1d9e0' }}
                  placeholder={isZh ? '护照上的英文全名' : 'Full name as on passport'}
                  value={form.full_name}
                  onChange={e => setForm(v => ({ ...v, full_name: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '角色' : 'Role'}</label>
                <select style={inp} value={form.role || ''}
                  onChange={e => setForm(v => ({ ...v, role: e.target.value }))}>
                  <option value="">{isZh ? '— 请选择 —' : '— Select role —'}</option>
                  {(isZh ? ROLES_ZH : ROLES_EN).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{isZh ? '国籍' : 'Nationality'}</label>
                <input style={inp} placeholder="Chinese / Pakistani / Indian…"
                  value={form.nationality || ''}
                  onChange={e => setForm(v => ({ ...v, nationality: e.target.value }))} />
              </div>
            </div>

            {/* Flags */}
            <div className="flex gap-5">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" style={{ color: NAVY }}>
                <input type="checkbox" checked={!!form.is_legal_representative}
                  onChange={e => setForm(v => ({ ...v, is_legal_representative: e.target.checked }))} />
                {isZh ? '法定代表人' : 'Legal Representative'}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" style={{ color: NAVY }}>
                <input type="checkbox" checked={!!form.is_manager}
                  onChange={e => setForm(v => ({ ...v, is_manager: e.target.checked }))} />
                {isZh ? '经理人' : 'Manager'}
              </label>
            </div>

            {/* Shareholding + DOB */}
            <div style={grid2}>
              <div>
                <label style={lbl}>{isZh ? '持股比例 (%)' : 'Shareholding (%)'}</label>
                <input type="number" min={0} max={100} step={0.01} style={inp}
                  placeholder="e.g. 51"
                  value={form.shareholding_percentage ?? ''}
                  onChange={e => setForm(v => ({ ...v, shareholding_percentage: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '出生日期' : 'Date of Birth'}</label>
                <input type="date" style={inp} value={form.date_of_birth || ''}
                  onChange={e => setForm(v => ({ ...v, date_of_birth: e.target.value }))} />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e8e0d0' }} />

            {/* Passport */}
            <p style={{ fontSize: 11, fontWeight: 900, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {isZh ? '护照信息' : 'Passport'}
            </p>
            <div style={grid2}>
              <div>
                <label style={lbl}>{isZh ? '护照号码' : 'Passport Number'}</label>
                <input style={inp} placeholder="A12345678"
                  value={form.passport_number || ''}
                  onChange={e => setForm(v => ({ ...v, passport_number: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '护照到期日' : 'Passport Expiry'}</label>
                <input type="date" style={inp} value={form.passport_expiry_date || ''}
                  onChange={e => setForm(v => ({ ...v, passport_expiry_date: e.target.value }))} />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e8e0d0' }} />

            {/* Emirates ID */}
            <p style={{ fontSize: 11, fontWeight: 900, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Emirates ID
            </p>
            <div style={grid3}>
              <div>
                <label style={lbl}>Emirates ID No.</label>
                <input style={inp} placeholder="784-YYYY-XXXXXXX-X"
                  value={form.emirates_id_number || ''}
                  onChange={e => setForm(v => ({ ...v, emirates_id_number: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? 'EID 到期日' : 'EID Expiry'}</label>
                <input type="date" style={inp} value={form.emirates_id_expiry_date || ''}
                  onChange={e => setForm(v => ({ ...v, emirates_id_expiry_date: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>UID No.</label>
                <input style={inp} placeholder="UID number"
                  value={form.uid_number || ''}
                  onChange={e => setForm(v => ({ ...v, uid_number: e.target.value }))} />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e8e0d0' }} />

            {/* Visa */}
            <p style={{ fontSize: 11, fontWeight: 900, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {isZh ? '签证信息' : 'Visa / Residence'}
            </p>
            <div style={grid3}>
              <div>
                <label style={lbl}>{isZh ? '签证号' : 'Visa Number'}</label>
                <input style={inp} placeholder="Visa / permit number"
                  value={form.visa_number || ''}
                  onChange={e => setForm(v => ({ ...v, visa_number: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '签证类型' : 'Visa Type'}</label>
                <input style={inp} placeholder="Employment / Investor / Family"
                  value={form.visa_type || ''}
                  onChange={e => setForm(v => ({ ...v, visa_type: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '签证到期日' : 'Visa Expiry'}</label>
                <input type="date" style={inp} value={form.visa_expiry_date || ''}
                  onChange={e => setForm(v => ({ ...v, visa_expiry_date: e.target.value }))} />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e8e0d0' }} />

            {/* Contact */}
            <p style={{ fontSize: 11, fontWeight: 900, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {isZh ? '联系方式' : 'Contact'}
            </p>
            <div style={grid3}>
              <div>
                <label style={lbl}>{isZh ? '手机' : 'Phone'}</label>
                <input style={inp} placeholder="+971 50 XXX XXXX"
                  value={form.phone || ''}
                  onChange={e => setForm(v => ({ ...v, phone: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '邮箱' : 'Email'}</label>
                <input type="email" style={inp} placeholder="person@email.com"
                  value={form.email || ''}
                  onChange={e => setForm(v => ({ ...v, email: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>{isZh ? '备注' : 'Notes'}</label>
                <input style={inp} placeholder={isZh ? '可选…' : 'Optional…'}
                  value={form.notes || ''}
                  onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} />
              </div>
            </div>

            {error && (
              <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c53030', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: NAVY, color: 'white' }}>
                {saving ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '确认保存' : 'Save Person')}
              </button>
              <button onClick={() => { setShowForm(false); setError(''); }}
                style={{ padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1.5px solid #d1d9e0', background: 'white', color: '#5a6a82' }}>
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Person list */}
      {persons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <div className="text-sm text-gray-500 font-medium">{isZh ? '暂无公司人员记录' : 'No persons added yet'}</div>
          <div className="text-xs text-gray-400 mt-1">
            {isZh ? '添加法定代表人、股东、签证持有人等' : 'Add legal reps, shareholders, visa holders and more'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {persons.map(p => {
            const passportLvl = level(p.passport_expiry_date);
            const eidLvl      = level(p.emirates_id_expiry_date);
            const visaLvl     = level(p.visa_expiry_date);

            return (
              <div key={p.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e8e0d0', background: 'white' }}>
                <div className="flex items-start justify-between p-4 gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name + role */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm" style={{ color: NAVY }}>{p.full_name}</span>
                      {p.role && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${NAVY}10`, color: NAVY }}>{p.role}</span>
                      )}
                      {p.is_legal_representative && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: `${GOLD}20`, color: '#8a6d1c' }}>
                          {isZh ? '法代' : 'Legal Rep'}
                        </span>
                      )}
                      {p.shareholding_percentage && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: '#EFF6FF', color: '#2563EB' }}>
                          {p.shareholding_percentage}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex gap-3 flex-wrap">
                      {p.nationality && <span>{p.nationality}</span>}
                      {p.date_of_birth && <span>{isZh ? '生日' : 'DOB'}: {p.date_of_birth}</span>}
                      {p.phone && <span>📱 {p.phone}</span>}
                      {p.email && <span>✉️ {p.email}</span>}
                    </div>

                    {/* Document chips */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {p.passport_number && (
                        <span className="text-xs px-2 py-1 rounded-lg flex items-center gap-1.5"
                          style={{ background: BADGE[passportLvl].bg, color: BADGE[passportLvl].text }}>
                          🛂 {p.passport_number}
                          {p.passport_expiry_date && (
                            <span className="font-bold">
                              · {(() => {
                                  const d = daysUntil(p.passport_expiry_date);
                                  return d !== null && d < 0
                                    ? (isZh ? `已逾期${Math.abs(d)}天` : `${Math.abs(d)}d overdue`)
                                    : d !== null ? (isZh ? `${d}天` : `${d}d`) : p.passport_expiry_date;
                                })()}
                            </span>
                          )}
                        </span>
                      )}
                      {p.emirates_id_number && (
                        <span className="text-xs px-2 py-1 rounded-lg flex items-center gap-1.5"
                          style={{ background: BADGE[eidLvl].bg, color: BADGE[eidLvl].text }}>
                          🪪 {p.emirates_id_number}
                          {p.emirates_id_expiry_date && (
                            <span className="font-bold">
                              · {(() => {
                                  const d = daysUntil(p.emirates_id_expiry_date);
                                  return d !== null && d < 0
                                    ? (isZh ? `已逾期${Math.abs(d)}天` : `${Math.abs(d)}d overdue`)
                                    : d !== null ? (isZh ? `${d}天` : `${d}d`) : p.emirates_id_expiry_date;
                                })()}
                            </span>
                          )}
                        </span>
                      )}
                      {p.visa_number && (
                        <span className="text-xs px-2 py-1 rounded-lg flex items-center gap-1.5"
                          style={{ background: BADGE[visaLvl].bg, color: BADGE[visaLvl].text }}>
                          ✈️ {p.visa_type || 'Visa'} {p.visa_number}
                          {p.visa_expiry_date && (
                            <span className="font-bold">
                              · {(() => {
                                  const d = daysUntil(p.visa_expiry_date);
                                  return d !== null && d < 0
                                    ? (isZh ? `已逾期${Math.abs(d)}天` : `${Math.abs(d)}d overdue`)
                                    : d !== null ? (isZh ? `${d}天` : `${d}d`) : p.visa_expiry_date;
                                })()}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {p.notes && (
                      <div className="text-xs text-gray-400 mt-1 italic">{p.notes}</div>
                    )}
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(p)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-bold"
                      style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      {isZh ? '编辑' : 'Edit'}
                    </button>
                    <button onClick={() => handleDelete(p)}
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
