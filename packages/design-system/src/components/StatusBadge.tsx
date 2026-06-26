import { statusMap, type StatusKey } from '../tokens';

interface StatusBadgeProps {
  status: StatusKey;
  label: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const s = statusMap[status];
  return (
    <span
      className="font-mono-label"
      style={{
        color: s.color,
        background: s.bg,
        borderRadius: 5,
        letterSpacing: '0.08em',
        fontSize: size === 'sm' ? 9.5 : 11,
        padding: size === 'sm' ? '2px 6px' : '3px 9px',
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}
