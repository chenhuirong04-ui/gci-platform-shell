import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '@gci/design-system';

export function AccessDenied() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
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
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div
          className="font-mono-label"
          style={{ fontSize: 11, letterSpacing: '0.2em', color: '#E0846A', marginBottom: 16 }}
        >
          ACCESS DENIED
        </div>
        <h1
          style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: 26,
            fontWeight: 600,
            color: colors.textPrimary,
            margin: '0 0 12px',
          }}
        >
          无访问权限
        </h1>
        <p style={{ fontSize: 14, color: '#505A70', lineHeight: 1.7, margin: '0 0 32px' }}>
          {profile?.display_name ? `${profile.display_name}，` : ''}
          你的账号没有访问此页面的权限。
          <br />
          如需开通，请联系 Chris。
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 20px',
              borderRadius: 9,
              background: 'rgba(203,168,92,0.12)',
              border: '1px solid rgba(203,168,92,0.28)',
              color: '#E2C988',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            返回首页
          </button>
          <button
            onClick={handleSignOut}
            style={{
              padding: '10px 20px',
              borderRadius: 9,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#7A8494',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
