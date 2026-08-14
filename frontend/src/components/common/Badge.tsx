import type { ReactNode } from 'react';

type BadgeVariant = 'blue' | 'red' | 'amber' | 'green' | 'gray';

interface BadgeProps {
  children: ReactNode;
  className?: string;
  variant?: BadgeVariant;
}

const badgeVariants: Record<BadgeVariant, string> = {
  blue: 'border-[#D7E7F7] bg-[#EAF3FC] text-[#185FA5]',
  red: 'border-[#F5D5D4] bg-[#FFF1F1] text-[#C13F3A]',
  amber: 'border-[#F6E0AF] bg-[#FFF7E1] text-[#A86A00]',
  green: 'border-[#CFE8D8] bg-[#EDF9F1] text-[#2E7D4F]',
  gray: 'border-[#E2E8F0] bg-[#F8F9FC] text-[#5B6E8C]'
};

function Badge({ children, className = '', variant = 'gray' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex min-h-[20px] items-center rounded-full border-[0.5px] px-2.5 text-[11px] font-semibold leading-5',
        badgeVariants[variant],
        className
      ].join(' ')}
    >
      {children}
    </span>
  );
}

export default Badge;
