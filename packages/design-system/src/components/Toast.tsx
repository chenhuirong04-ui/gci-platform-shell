import { colors } from '../tokens';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed" style={{ bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 300, animation: 'toast .22s ease both' }}>
      <div
        className="flex items-center"
        style={{ gap: 12, background: '#0C1224', border: `1px solid rgba(203,168,92,0.45)`, borderRadius: 12, padding: '13px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
      >
        <span style={{ color: colors.goldBase, fontSize: 14 }}>→</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EDE4C8' }}>{message}</span>
      </div>
    </div>
  );
}
