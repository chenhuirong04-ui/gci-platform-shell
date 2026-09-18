import { useEffect, useMemo, useState } from 'react';
import { colors } from '@gci/design-system';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAccountLogins, createAccountLogin, updateAccountLogin, revealPassword, encryptPassword,
  type AccountLogin, type AccountLoginInput, type MfaMethod, type AccountLoginStatus,
} from '../lib/accountVaultService';

// GCI Company Documents — Accounts & Logins (账号与登录). Credentials for the
// company's EXTERNAL systems (EmaraTax, Dubai Trade, JAFZA, DEWA, banks,
// Hostinger, Google, etc.) — not GCI app staff/module permissions, which
// stay entirely separate in user_profiles. Whole feature is Admin-only,
// enforced for real by RLS on company_account_logins (see the migration) —
// the role_label check here is convenience only, same pattern as
// CompanyDocuments.tsx's own isAdmin check.

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const MFA_OPTIONS: { value: MfaMethod; zh: string; en: string }[] = [
  { value: 'sms_otp', zh: 'SMS OTP', en: 'SMS OTP' },
  { value: 'email_otp', zh: 'Email OTP', en: 'Email OTP' },
  { value: 'uae_pass', zh: 'UAE PASS', en: 'UAE PASS' },
  { value: 'authenticator', zh: 'Authenticator', en: 'Authenticator' },
  { value: 'none', zh: '无', en: 'None' },
];
const STATUS_OPTIONS: { value: AccountLoginStatus; zh: string; en: string; color: string }[] = [
  { value: 'active', zh: '可用', en: 'Active', color: GREEN },
  { value: 'pending', zh: '待确认', en: 'Pending', color: AMBER },
  { value: 'issue', zh: '有问题', en: 'Issue', color: RED },
  { value: 'disabled', zh: '已停用', en: 'Disabled', color: MUTED },
];
const mfaLabel = (v: MfaMethod, isZh: boolean) => MFA_OPTIONS.find(o => o.value === v)?.[isZh ? 'zh' : 'en'] || v;
const statusMeta = (v: AccountLoginStatus) => STATUS_OPTIONS.find(o => o.value === v) || STATUS_OPTIONS[1];

const inputSt: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${BORD}`, color: colors.textPrimary,
};

const EMPTY_FORM: AccountLoginInput = {
  platform_name: '', company_name: '', login_url: '', username: '', login_email: '',
  phone: '', recovery_email: '', mfa_method: 'none', owner: '', status: 'pending',
  last_verified_at: '', notes: '',
};

export function AccountVault() {
  const { profile } = useAuth();
  const isAdmin = profile?.role_label === 'Admin';
  const isZh = (localStorage.getItem('gci_platform_language_v1') || 'zh') === 'zh';

  const [rows, setRows] = useState<AccountLogin[] | null>(null);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealBusy, setRevealBusy] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<Record<string, string>>({});

  const [editing, setEditing] = useState<AccountLogin | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AccountLoginInput>(EMPTY_FORM);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function load() {
    fetchAccountLogins().then(setRows);
  }
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const companies = useMemo(() => Array.from(new Set((rows || []).map(r => r.company_name))).sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (companyFilter && r.company_name !== companyFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (q && !(
        r.platform_name.toLowerCase().includes(q)
        || r.company_name.toLowerCase().includes(q)
        || (r.username || '').toLowerCase().includes(q)
        || (r.login_email || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [rows, search, companyFilter, statusFilter]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setNewPassword(''); setFormError(''); setShowForm(true); };
  const openEdit = (r: AccountLogin) => {
    setEditing(r);
    setForm({
      platform_name: r.platform_name, company_name: r.company_name, login_url: r.login_url || '',
      username: r.username || '', login_email: r.login_email || '', phone: r.phone || '',
      recovery_email: r.recovery_email || '', mfa_method: r.mfa_method, owner: r.owner || '',
      status: r.status, last_verified_at: r.last_verified_at || '', notes: r.notes || '',
    });
    setNewPassword('');
    setFormError('');
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); setNewPassword(''); setFormError(''); };

  const handleReveal = async (r: AccountLogin) => {
    if (revealed[r.id] !== undefined) {
      setRevealed(prev => { const next = { ...prev }; delete next[r.id]; return next; });
      return;
    }
    setRevealBusy(r.id);
    setRevealError(prev => ({ ...prev, [r.id]: '' }));
    const res = await revealPassword(r.id);
    setRevealBusy(null);
    if (!res.ok) { setRevealError(prev => ({ ...prev, [r.id]: res.error })); return; }
    setRevealed(prev => ({ ...prev, [r.id]: res.password }));
  };

  const handleSave = async () => {
    if (!form.platform_name.trim()) { setFormError(isZh ? '请填写系统/平台名称' : 'Platform name is required'); return; }
    if (!form.company_name.trim()) { setFormError(isZh ? '请填写所属公司' : 'Company is required'); return; }
    setSaving(true);
    setFormError('');

    let payload: AccountLoginInput = { ...form };
    if (newPassword) {
      const enc = await encryptPassword(newPassword);
      if (!enc.ok) { setSaving(false); setFormError(enc.error); return; }
      payload = { ...payload, newPasswordCiphertext: enc.ciphertext, newPasswordIv: enc.iv };
    }

    const { error } = editing
      ? await updateAccountLogin(editing.id, payload)
      : await createAccountLogin(payload);
    setSaving(false);
    if (error) { setFormError(error); return; }
    closeForm();
    load();
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
        {isZh ? '仅管理员可访问账号与登录。' : 'Accounts & Logins is Admin-only.'}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder={isZh ? '搜索平台、公司、账号…' : 'Search platform, company, account…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, minWidth: 220 }}
        />
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={inputSt}>
          <option value="">{isZh ? '全部公司' : 'All Companies'}</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputSt}>
          <option value="">{isZh ? '全部状态' : 'All Statuses'}</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{isZh ? s.zh : s.en}</option>)}
        </select>
        <button
          onClick={openNew}
          style={{ marginLeft: 'auto', padding: '9px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}
        >
          + {isZh ? '新增账号' : 'Add Account'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: 16, marginBottom: 16, background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {editing ? (isZh ? '编辑账号' : 'Edit Account') : (isZh ? '新增账号' : 'New Account')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <input placeholder={isZh ? '系统/平台名称 *' : 'Platform Name *'} value={form.platform_name} onChange={e => setForm(f => ({ ...f, platform_name: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '所属公司 *' : 'Company *'} value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '登录网址' : 'Login URL'} value={form.login_url} onChange={e => setForm(f => ({ ...f, login_url: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '登录账号' : 'Username'} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '登录邮箱' : 'Login Email'} value={form.login_email} onChange={e => setForm(f => ({ ...f, login_email: e.target.value }))} style={inputSt} />
            <input
              type="password"
              placeholder={editing ? (isZh ? '新密码（留空则不修改）' : 'New password (leave blank to keep)') : (isZh ? '密码' : 'Password')}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={inputSt}
              autoComplete="new-password"
            />
            <input placeholder={isZh ? '手机号' : 'Phone'} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '找回邮箱' : 'Recovery Email'} value={form.recovery_email} onChange={e => setForm(f => ({ ...f, recovery_email: e.target.value }))} style={inputSt} />
            <select value={form.mfa_method} onChange={e => setForm(f => ({ ...f, mfa_method: e.target.value as MfaMethod }))} style={inputSt}>
              {MFA_OPTIONS.map(o => <option key={o.value} value={o.value}>{isZh ? o.zh : o.en}</option>)}
            </select>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AccountLoginStatus }))} style={inputSt}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{isZh ? o.zh : o.en}</option>)}
            </select>
            <input placeholder={isZh ? '负责人' : 'Owner'} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} style={inputSt} />
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '最近验证日期' : 'Last Verified'}</label>
              <input type="date" value={form.last_verified_at} onChange={e => setForm(f => ({ ...f, last_verified_at: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <input placeholder={isZh ? '备注' : 'Notes'} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={saving} onClick={handleSave}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}
            >
              {saving ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存' : 'Save')}
            </button>
            <button onClick={closeForm} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
              {isZh ? '取消' : 'Cancel'}
            </button>
            {formError && <span style={{ fontSize: 12, color: RED }}>{formError}</span>}
          </div>
        </div>
      )}

      {!rows && <div style={{ color: MUTED, fontSize: 13 }}>{isZh ? '加载中…' : 'Loading…'}</div>}
      {rows && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, color: MUTED, fontSize: 13 }}>
          {isZh ? '没有符合条件的账号' : 'No accounts match this view'}
        </div>
      )}

      {rows && filtered.length > 0 && (
        <div style={{ border: `1px solid ${BORD}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {[
                  isZh ? '系统/平台' : 'Platform', isZh ? '所属公司' : 'Company', isZh ? '登录账号/邮箱' : 'Account / Email',
                  isZh ? '密码' : 'Password', isZh ? '验证方式' : 'MFA', isZh ? '登录网址' : 'URL', isZh ? '状态' : 'Status', '',
                ].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', fontSize: 10, letterSpacing: '0.1em', color: MUTED, padding: '12px 16px', borderBottom: `1px solid ${BORD}`, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = statusMeta(r.status);
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{r.platform_name}</td>
                    <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{r.company_name}</td>
                    <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{r.username || r.login_email || '—'}</td>
                    <td style={{ fontSize: 12, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                      {r.has_password ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'monospace', color: colors.textSecondary }}>
                            {revealed[r.id] !== undefined ? revealed[r.id] : '••••••••'}
                          </span>
                          <button
                            disabled={revealBusy === r.id}
                            onClick={() => handleReveal(r)}
                            style={{ fontSize: 10.5, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {revealBusy === r.id ? (isZh ? '…' : '…') : revealed[r.id] !== undefined ? (isZh ? '隐藏' : 'Hide') : (isZh ? '显示' : 'Show')}
                          </button>
                          {revealError[r.id] && <span style={{ fontSize: 10, color: RED }}>{revealError[r.id]}</span>}
                        </div>
                      ) : <span style={{ color: MUTED }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{mfaLabel(r.mfa_method, isZh)}</td>
                    <td style={{ fontSize: 12, padding: '12px 16px', borderBottom: `1px solid ${BORD}`, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.login_url ? <a href={r.login_url} target="_blank" rel="noreferrer" style={{ color: GOLD }}>{r.login_url}</a> : <span style={{ color: MUTED }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                      <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${st.color}22`, color: st.color }}>
                        {isZh ? st.zh : st.en}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(r)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                          {isZh ? '查看' : 'View'}
                        </button>
                        <button onClick={() => openEdit(r)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                          {isZh ? '编辑' : 'Edit'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
