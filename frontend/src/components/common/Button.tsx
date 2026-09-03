import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-[#D7E7F7] bg-white text-[#185FA5] hover:bg-[#F5F9FD] focus-visible:ring-[#185FA5]/20',
  danger:
    'border-[#F3C7C5] bg-[#FFF4F4] text-[#C13F3A] hover:bg-[#FFE9E9] focus-visible:ring-[#C13F3A]/20',
  ghost:
    'border-transparent bg-transparent text-[#5B6E8C] hover:bg-[#F1F4F9] focus-visible:ring-[#185FA5]/10'
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[32px] px-3 text-xs',
  md: 'min-h-[36px] px-4 text-sm',
  lg: 'min-h-[40px] px-5 text-sm'
};

function Button({
  children,
  className = '',
  disabled = false,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-[10px] border-[0.5px] border-solid font-semibold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className // Custom classes come last to override variant/size classes
      ].join(' ')}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export default Button;
