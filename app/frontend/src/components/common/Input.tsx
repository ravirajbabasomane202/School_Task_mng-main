import type { InputHTMLAttributes } from 'react';

type RegisterProps = {
  disabled?: boolean;
  name?: string;
  onBlur?: InputHTMLAttributes<HTMLInputElement>['onBlur'];
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange'];
  ref?: ((instance: HTMLInputElement | null) => void) | null;
  value?: InputHTMLAttributes<HTMLInputElement>['value'];
};

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  error?: string;
  label?: string;
  register?: RegisterProps;
}

function Input({ className = '', error, id, label, register, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-') ?? undefined;

  return (
    <label className="flex w-full flex-col gap-1.5" htmlFor={inputId}>
      {label ? <span className="text-[12px] font-medium text-[#36506C]">{label}</span> : null}
      <input
        id={inputId}
        className={[
          'min-h-[38px] rounded-[10px] border-[0.5px] border-solid border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none transition placeholder:text-[#8A99B0] focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10',
          error ? 'border-[#C13F3A] focus:border-[#C13F3A] focus:ring-[#C13F3A]/10' : '',
          className
        ].join(' ')}
        {...register}
        {...props}
      />
      {error ? <span className="text-[11px] text-[#C13F3A]">{error}</span> : null}
    </label>
  );
}

export default Input;
