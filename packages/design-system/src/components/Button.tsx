import type { ButtonHTMLAttributes } from 'react';
import { colors } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: `linear-gradient(135deg,${colors.goldStrong},${colors.goldMuted})`,
    color: colors.bgBase,
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: colors.goldBase,
    border: '1px solid rgba(203,168,92,0.45)',
  },
  ghost: {
    background: 'rgba(255,255,255,0.04)',
    color: colors.textSecondary,
    border: '1px solid rgba(255,255,255,0.1)',
  },
  danger: {
    background: 'rgba(224,132,106,0.12)',
    color: colors.statusDanger,
    border: '1px solid rgba(224,132,106,0.3)',
  },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', style, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        fontFamily: "'Space Grotesk',sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
        borderRadius: 10,
        padding: '9px 18px',
        cursor: 'pointer',
        transition: 'opacity .15s ease',
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    />
  );
}
