// Set a new password after opening a Supabase Auth recovery link.
// The form is shown only once Supabase has verified the link and issued a
// recovery session; a missing, used or expired link gets an explanation and a
// way back to request a new one.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { supabase, isPasswordRecovery, clearPasswordRecovery, authLinkError } from '../lib/supabase';
import { validateNewPassword, describePasswordUpdateError, MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 14,
  color: colors.textPrimary,
  outline: 'none',
  width: '100%',
} as const;

const labelStyle = { fontSize: 11.5, color: '#7A8494', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' } as const;

export function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const settle = (s: Status) => { if (!cancelled) setStatus(s); };

    async function verify() {
      if (authLinkError) { settle('invalid'); return; }

      // Email templates that link with ?token_hash=…&type=recovery are verified here.
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      if (tokenHash && params.get('type') === 'recovery') {
        window.history.replaceState(null, '', window.location.pathname);
        const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        settle(err ? 'invalid' : 'ready');
        return;
      }

      // Default links (#access_token=…&type=recovery) are verified by supabase-js
      // on load; it then reports PASSWORD_RECOVERY with a session.
      const { data: { session } } = await supabase.auth.getSession();
      if (session && isPasswordRecovery()) { settle('ready'); return; }
      await new Promise((r) => setTimeout(r, 1500));
      const again = await supabase.auth.getSession();
      settle(again.data.session && isPasswordRecovery() ? 'ready' : 'invalid');
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) settle('ready');
    });
    verify().catch(() => settle('invalid'));
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = validateNewPassword(next, confirm);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (err) { setError(describePasswordUpdateError(err)); return; }
    clearPasswordRecovery();
    setStatus('done');
    setTimeout(() => navigate('/', { replace: true }), 1500);
  }

  async function backToLogin() {
    clearPasswordRecovery();
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '44px 40px' }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: colors.textPrimary, margin: '0 0 6px' }}>
          设置新密码
        </h2>

        {status === 'checking' && (
          <p style={{ fontSize: 13, color: '#7A8494', margin: '12px 0 0' }}>正在验证重置链接…</p>
        )}

        {status === 'invalid' && (
          <>
            <p style={{ fontSize: 13, color: '#E0846A', margin: '12px 0 20px', lineHeight: 1.6 }}>
              重置链接无效、已使用或已过期。请回到登录页，点“忘记密码？”重新获取链接。
            </p>
            <button type="button" onClick={backToLogin} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#CBA85C,#E2C988)', color: '#080D1E', fontWeight: 600, cursor: 'pointer' }}>
              返回登录
            </button>
          </>
        )}

        {status === 'done' && (
          <p style={{ fontSize: 13, color: '#8FD3A8', margin: '12px 0 0' }}>新密码已设置，正在进入 GCI…</p>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
            <p style={{ fontSize: 12.5, color: '#505A70', margin: 0 }}>
              至少 {MIN_PASSWORD_LENGTH} 位，需包含字母和数字。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>新密码</label>
              <input type={show ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>确认新密码</label>
              <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required style={inputStyle} />
            </div>
            <label style={{ fontSize: 12, color: '#7A8494', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> 显示密码
            </label>
            {error && (
              <div style={{ fontSize: 12.5, color: '#E0846A', background: 'rgba(224,132,106,0.1)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8, padding: '9px 12px' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={saving} style={{ marginTop: 6, padding: 13, borderRadius: 10, border: 'none', background: saving ? 'rgba(203,168,92,0.4)' : 'linear-gradient(135deg,#CBA85C,#E2C988)', color: '#080D1E', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '保存中…' : '保存新密码'}
            </button>
            <button type="button" onClick={backToLogin} style={{ background: 'none', border: 'none', color: '#CBA85C', fontSize: 12.5, cursor: 'pointer' }}>
              取消并返回登录
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
