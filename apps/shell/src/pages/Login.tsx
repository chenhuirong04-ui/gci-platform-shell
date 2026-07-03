import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '@gci/design-system';

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError('邮箱或密码错误，请重试。');
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '44px 40px',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg,#CBA85C,#E2C988)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 700,
              fontSize: 16,
              color: '#080D1E',
              boxShadow: '0 4px 16px rgba(203,168,92,0.3)',
            }}
          >
            G
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
              GCI Platform
            </div>
            <div className="font-mono-label" style={{ fontSize: 9, letterSpacing: '0.18em', color: '#505A70', marginTop: 1 }}>
              GLOBAL CARE INFO
            </div>
          </div>
        </div>

        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: colors.textPrimary, margin: '0 0 6px' }}>
          登录
        </h2>
        <p style={{ fontSize: 13, color: '#505A70', margin: '0 0 28px' }}>
          使用你的 GCI 账号继续
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, color: '#7A8494', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' }}>
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              required
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '11px 14px',
                fontSize: 14,
                color: colors.textPrimary,
                outline: 'none',
                width: '100%',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.5)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, color: '#7A8494', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '11px 14px',
                fontSize: 14,
                color: colors.textPrimary,
                outline: 'none',
                width: '100%',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.5)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: '#E0846A', background: 'rgba(224,132,106,0.1)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8, padding: '9px 12px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: '13px',
              borderRadius: 10,
              background: loading ? 'rgba(203,168,92,0.4)' : 'linear-gradient(135deg,#CBA85C,#E2C988)',
              border: 'none',
              color: '#080D1E',
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
