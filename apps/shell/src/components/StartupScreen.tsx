// GCI Executive Desk — Task 16.1: first-load black screen fix.
// A visible loading/error state for the window between mount and the
// initial Supabase session restore resolving — previously App.tsx and
// ProtectedRoute.tsx both did `if (loading) return null`, which rendered
// nothing at all (just the page background) if that restore ever hung.
const NAVY = '#080D1E';
const GOLD = '#CBA85C';
const MUTED = '#7A8494';
const RED = '#E0846A';

export function StartupLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: NAVY, flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '3px solid rgba(203,168,92,0.2)', borderTopColor: GOLD,
          animation: 'gci-spin 0.8s linear infinite',
        }}
      />
      <div style={{ fontSize: 13.5, color: MUTED, fontFamily: "'Space Grotesk',sans-serif" }}>正在加载 GCI…</div>
      <style>{'@keyframes gci-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

export function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: NAVY, flexDirection: 'column', gap: 14, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: RED, fontFamily: "'Space Grotesk',sans-serif" }}>加载失败，请重试</div>
      <div style={{ fontSize: 11.5, color: MUTED, maxWidth: 420 }}>{message}</div>
      <button
        onClick={onRetry}
        style={{ padding: '9px 20px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        重新加载
      </button>
    </div>
  );
}
