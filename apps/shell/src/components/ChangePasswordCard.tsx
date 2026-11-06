// Settings → change password for the signed-in user.
// The current password is checked first (a fresh Supabase sign-in for the same
// account), then Supabase Auth updateUser() sets the new one.
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { validateNewPassword, describePasswordUpdateError, MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';

const MUTED = '#475569';
const BORD = 'rgba(12,27,58,0.12)';
const inputStyle = {
  padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORD}`, fontSize: 13.5,
  background: '#FFFFFF', color: '#0C1B3A', outline: 'none', width: '100%',
} as const;

export function ChangePasswordCard({ isZh }: { isZh: boolean }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const t = (zh: string, en: string) => (isZh ? zh : en);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (!user?.email) { setError(t('未找到当前账号邮箱，请重新登录。', 'No account email found. Please sign in again.')); return; }
    if (!current) { setError(t('请输入当前密码。', 'Enter your current password.')); return; }
    const problem = validateNewPassword(next, confirm);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (check.error) {
      setSaving(false);
      setError(t('当前密码不正确。', 'Current password is incorrect.'));
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (err) { setError(describePasswordUpdateError(err)); return; }
    setCurrent(''); setNext(''); setConfirm('');
    setDone(true);
  }

  const label = (text: string) => <span style={{ fontSize: 12, color: MUTED }}>{text}</span>;

  return (
    <form onSubmit={handleSubmit} style={{ padding: '18px 20px', background: '#FFFFFF', border: '1px solid rgba(12,27,58,0.07)', borderRadius: 12, maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0C1B3A' }}>{t('修改密码', 'Change password')}</div>
      <div style={{ fontSize: 12, color: MUTED }}>
        {t(`账号：${user?.email ?? '—'}。新密码至少 ${MIN_PASSWORD_LENGTH} 位，需包含字母和数字。`, `Account: ${user?.email ?? '—'}. At least ${MIN_PASSWORD_LENGTH} characters with letters and numbers.`)}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {label(t('当前密码', 'Current password'))}
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {label(t('新密码', 'New password'))}
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {label(t('确认新密码', 'Confirm new password'))}
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" style={inputStyle} />
      </label>
      {error && <div style={{ fontSize: 12.5, color: '#B42318', background: 'rgba(180,35,24,0.06)', borderRadius: 8, padding: '8px 10px' }}>{error}</div>}
      {done && <div style={{ fontSize: 12.5, color: '#067647', background: 'rgba(6,118,71,0.07)', borderRadius: 8, padding: '8px 10px' }}>{t('密码已更新，下次登录请使用新密码。', 'Password updated. Use it next time you sign in.')}</div>}
      <button type="submit" disabled={saving} style={{ alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 8, border: 'none', background: saving ? 'rgba(8,13,30,0.4)' : '#080D1E', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? t('保存中…', 'Saving…') : t('更新密码', 'Update password')}
      </button>
    </form>
  );
}
