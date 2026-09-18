import { useEffect, useMemo, useRef, useState } from 'react';
import { colors } from '@gci/design-system';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAccountLogins, createAccountLogin, updateAccountLogin, revealPassword, encryptPassword,
  listAttachments, uploadAttachment, deleteAttachment, getAttachmentSignedUrl, ATTACHMENT_ACCEPT,
  type AccountLogin, type AccountLoginInput, type MfaMethod, type AccountLoginStatus, type AccountLoginAttachment,
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
  // Task: minimal-entry form. One unified "登录账号 / Login ID" input in the
  // default view — maps to username or login_email at save time depending on
  // whether it looks like an email. The separate 登录邮箱 field still exists
  // independently under "更多信息" for the (rarer) case of a username-based
  // login that also has its own distinct recorded email.
  const [loginId, setLoginId] = useState('');
  const [showMore, setShowMore] = useState(false);

  // Attachments/screenshots — for an existing record they upload immediately
  // (real account_login_id already exists); for a brand-new record, picked
  // files are held locally and only actually uploaded once "保存" creates
  // the row (see handleSave).
  const [attachments, setAttachments] = useState<AccountLoginAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const openNew = () => {
    setEditing(null); setForm(EMPTY_FORM); setNewPassword(''); setFormError('');
    setAttachments([]); setPendingFiles([]); setAttachmentError('');
    setLoginId(''); setShowMore(false);
    setShowForm(true);
  };
  const openEdit = (r: AccountLogin) => {
    setEditing(r);
    setForm({
      platform_name: r.platform_name, company_name: r.company_name, login_url: r.login_url || '',
      username: r.username || '', login_email: r.login_email || '', phone: r.phone || '',
      recovery_email: r.recovery_email || '', mfa_method: r.mfa_method, owner: r.owner || '',
      status: r.status, last_verified_at: r.last_verified_at || '', notes: r.notes || '',
    });
    // Display priority: username first, else login_email (per spec).
    setLoginId(r.username || r.login_email || '');
    setShowMore(false);
    setNewPassword('');
    setFormError('');
    setPendingFiles([]);
    setAttachmentError('');
    setAttachments([]);
    listAttachments(r.id).then(setAttachments);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false); setEditing(null); setForm(EMPTY_FORM); setNewPassword(''); setFormError('');
    setAttachments([]); setPendingFiles([]); setAttachmentError('');
    setLoginId(''); setShowMore(false);
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).filter(f => ATTACHMENT_ACCEPT.includes(f.type));
    if (picked.length === 0) {
      setAttachmentError(isZh ? '只支持 JPG、PNG、PDF' : 'Only JPG, PNG, PDF are supported');
      return;
    }
    setAttachmentError('');
    if (editing) {
      setAttachmentBusy(true);
      for (const f of picked) {
        const res = await uploadAttachment(editing.id, f);
        if (!res.ok) setAttachmentError(res.error);
        else setAttachments(prev => [res.attachment, ...prev]);
      }
      setAttachmentBusy(false);
    } else {
      setPendingFiles(prev => [...prev, ...picked]);
    }
  };

  const handleRemovePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDeleteAttachment = async (a: AccountLoginAttachment) => {
    if (!window.confirm(isZh ? `确认删除「${a.file_name}」？` : `Delete "${a.file_name}"?`)) return;
    setAttachmentBusy(true);
    const { error } = await deleteAttachment(a.id, a.storage_path);
    setAttachmentBusy(false);
    if (error) { setAttachmentError(error); return; }
    setAttachments(prev => prev.filter(x => x.id !== a.id));
  };

  const handleViewAttachment = async (a: AccountLoginAttachment) => {
    const url = await getAttachmentSignedUrl(a.storage_path);
    if (url) window.open(url, '_blank');
  };

  const handleDownloadAttachment = async (a: AccountLoginAttachment) => {
    const url = await getAttachmentSignedUrl(a.storage_path);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = a.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

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

  // Minimum to save: platform + company are always required; beyond that,
  // either some login detail OR at least one attachment is enough — a
  // screenshot with nothing else typed in yet is a valid, complete save.
  const hasLoginInfo = !!(loginId.trim() || form.login_email.trim() || newPassword.trim());
  const hasAttachments = editing ? attachments.length > 0 : pendingFiles.length > 0;

  const handleSave = async () => {
    if (!form.platform_name.trim()) { setFormError(isZh ? '请填写系统/平台名称' : 'Platform name is required'); return; }
    if (!form.company_name.trim()) { setFormError(isZh ? '请填写所属公司' : 'Company is required'); return; }
    if (!hasLoginInfo && !hasAttachments) {
      setFormError(isZh
        ? '请至少填写一项登录信息，或上传至少一张截图/附件'
        : 'Please fill in at least one login detail, or upload at least one attachment');
      return;
    }
    setSaving(true);
    setFormError('');

    // Map the unified Login ID field to the underlying username/login_email
    // columns: an "@" means it's an email, otherwise treat it as a username.
    // The advanced "更多信息" login_email field (if separately filled in) is
    // preserved unless the Login ID itself is an email, in which case it
    // takes over that slot.
    const trimmedLoginId = loginId.trim();
    const idLooksLikeEmail = trimmedLoginId.includes('@');
    let payload: AccountLoginInput = {
      ...form,
      username: idLooksLikeEmail ? '' : trimmedLoginId,
      login_email: idLooksLikeEmail ? trimmedLoginId : form.login_email,
    };
    if (newPassword) {
      const enc = await encryptPassword(newPassword);
      if (!enc.ok) { setSaving(false); setFormError(enc.error); return; }
      payload = { ...payload, newPasswordCiphertext: enc.ciphertext, newPasswordIv: enc.iv };
    }

    if (editing) {
      const { error } = await updateAccountLogin(editing.id, payload);
      setSaving(false);
      if (error) { setFormError(error); return; }
      closeForm();
      load();
      return;
    }

    const created = await createAccountLogin(payload);
    if (!created.ok) { setSaving(false); setFormError(created.error); return; }

    if (pendingFiles.length > 0) {
      const failed: string[] = [];
      for (const f of pendingFiles) {
        const res = await uploadAttachment(created.id, f);
        if (!res.ok) failed.push(f.name);
      }
      setSaving(false);
      if (failed.length > 0) {
        // Account itself is saved — switch into edit mode for it so a retry
        // doesn't create a second row, and show what still needs re-upload.
        setPendingFiles([]);
        setAttachmentError(isZh
          ? `账号已保存，但以下附件上传失败，请重新上传：${failed.join('、')}`
          : `Account saved, but these attachments failed — please re-upload: ${failed.join(', ')}`);
        openEdit({ ...payload, id: created.id, has_password: !!newPassword } as unknown as AccountLogin);
        load();
        return;
      }
    }
    setSaving(false);
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
          {/* ── Default view: minimal-entry core fields ─────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <input placeholder={isZh ? '系统/平台名称 *' : 'Platform Name *'} value={form.platform_name} onChange={e => setForm(f => ({ ...f, platform_name: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '所属公司 *' : 'Company *'} value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} style={inputSt} />
            <input placeholder={isZh ? '登录账号（用户名或邮箱）' : 'Login ID (username or email)'} value={loginId} onChange={e => setLoginId(e.target.value)} style={inputSt} />
            <input
              type="password"
              placeholder={editing ? (isZh ? '新密码（留空则不修改）' : 'New password (leave blank to keep)') : (isZh ? '密码' : 'Password')}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={inputSt}
              autoComplete="new-password"
            />
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AccountLoginStatus }))} style={inputSt}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{isZh ? o.zh : o.en}</option>)}
            </select>
          </div>

          {/* ── More details (collapsed by default) ─────────────────────── */}
          <div>
            <button
              type="button"
              onClick={() => setShowMore(v => !v)}
              style={{ padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: GOLD }}
            >
              {isZh ? '更多信息' : 'More details'} {showMore ? '▴' : '▾'}
            </button>
            {showMore && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 8 }}>
                <input placeholder={isZh ? '登录网址' : 'Login URL'} value={form.login_url} onChange={e => setForm(f => ({ ...f, login_url: e.target.value }))} style={inputSt} />
                <input placeholder={isZh ? '登录邮箱' : 'Login Email'} value={form.login_email} onChange={e => setForm(f => ({ ...f, login_email: e.target.value }))} style={inputSt} />
                <input placeholder={isZh ? '手机号' : 'Phone'} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputSt} />
                <input placeholder={isZh ? '找回邮箱' : 'Recovery Email'} value={form.recovery_email} onChange={e => setForm(f => ({ ...f, recovery_email: e.target.value }))} style={inputSt} />
                <select value={form.mfa_method} onChange={e => setForm(f => ({ ...f, mfa_method: e.target.value as MfaMethod }))} style={inputSt}>
                  {MFA_OPTIONS.map(o => <option key={o.value} value={o.value}>{isZh ? o.zh : o.en}</option>)}
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
            )}
          </div>

          {/* ── Attachments / Screenshots ───────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {isZh ? '截图 / 附件' : 'Attachments / Screenshots'}
              </label>
              <button
                disabled title={isZh ? '暂未实现，敬请期待' : 'Not implemented yet'}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10.5, cursor: 'not-allowed', background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORD}`, color: MUTED, opacity: 0.6 }}
              >
                ✦ {isZh ? 'AI 识别' : 'AI Recognize'}
              </button>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px dashed ${BORD}`, color: GOLD }}
            >
              + {isZh ? '上传截图/附件' : 'Add Attachment'}
            </button>
            <input
              ref={fileInputRef} type="file" multiple className="hidden" style={{ display: 'none' }}
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }}
            />
            {attachmentBusy && <span style={{ marginLeft: 10, fontSize: 11.5, color: MUTED }}>{isZh ? '处理中…' : 'Working…'}</span>}
            {attachmentError && <div style={{ fontSize: 11.5, color: RED, marginTop: 6 }}>{attachmentError}</div>}

            {/* Already-uploaded (existing record) */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {attachments.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORD}` }}>
                    <span style={{ fontSize: 15 }}>{a.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
                    <span style={{ fontSize: 11.5, color: colors.textPrimary, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</span>
                    <button onClick={() => handleViewAttachment(a)} style={{ fontSize: 10.5, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{isZh ? '查看' : 'View'}</button>
                    <button onClick={() => handleDownloadAttachment(a)} style={{ fontSize: 10.5, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{isZh ? '下载' : 'Download'}</button>
                    <button onClick={() => handleDeleteAttachment(a)} style={{ fontSize: 10.5, color: RED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{isZh ? '删除' : 'Delete'}</button>
                  </div>
                ))}
              </div>
            )}

            {/* Picked but not-yet-uploaded (brand-new record, uploads on Save) */}
            {pendingFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(203,168,92,0.08)', border: `1px solid ${GOLD}40` }}>
                    <span style={{ fontSize: 15 }}>{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                    <span style={{ fontSize: 11.5, color: colors.textPrimary, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 10, color: GOLD }}>{isZh ? '待保存' : 'Pending'}</span>
                    <button onClick={() => handleRemovePendingFile(i)} style={{ fontSize: 10.5, color: RED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{isZh ? '移除' : 'Remove'}</button>
                  </div>
                ))}
              </div>
            )}
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
