import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { forwardRef, useId } from 'react';
import { Loader2, Lock } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90 shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-sunken',
  ghost: 'text-muted hover:text-fg hover:bg-sunken',
  danger: 'bg-surface text-danger border border-danger/30 hover:bg-danger/5',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-lg',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'accent' | 'pro' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-sunken text-muted border-border',
    accent: 'bg-accent-soft text-accent border-accent/20',
    pro: 'bg-pro/10 text-pro border-pro/25',
    success: 'bg-success/10 text-success border-success/25',
    warning: 'bg-warning/10 text-warning border-warning/25',
    danger: 'bg-danger/10 text-danger border-danger/25',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProBadge({ className }: { className?: string }) {
  return (
    <Badge tone="pro" className={className}>
      <Lock className="h-2.5 w-2.5" aria-hidden />
      Pro
    </Badge>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-border bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{children}</h3>
      {action}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  trailing?: ReactNode;
}

export function Switch({ checked, onChange, label, description, disabled, trailing }: SwitchProps) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-3 py-1.5', disabled && 'opacity-60')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-border',
        )}
      >
        <span
          className={cx(
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
          )}
        />
      </button>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex items-center gap-2 text-[13px] text-fg">
          {label}
          {trailing}
        </span>
        {description && <span className="block text-xs text-subtle">{description}</span>}
      </label>
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          'h-8 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-fg placeholder:text-subtle',
          'transition-colors focus:border-accent/60 disabled:opacity-60',
          className,
        )}
        {...rest}
      />
    );
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'h-8 rounded-lg border border-border bg-surface px-2 text-[13px] text-fg focus:border-accent/60 disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cx('h-4 w-4 animate-spin text-accent', className)} aria-label="Loading" />
  );
}

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
    >
      {value === null ? (
        <div className="h-full w-1/3 animate-progress rounded-full bg-accent" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      )}
    </div>
  );
}

export function Notice({
  tone = 'neutral',
  icon,
  title,
  children,
  action,
}: {
  tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'accent';
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    neutral: 'border-border bg-sunken',
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-danger/30 bg-danger/5',
    success: 'border-success/30 bg-success/5',
    accent: 'border-accent/25 bg-accent-soft/60',
  } as const;
  const iconTones = {
    neutral: 'text-muted',
    warning: 'text-warning',
    danger: 'text-danger',
    success: 'text-success',
    accent: 'text-accent',
  } as const;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-xl border p-3 animate-fade-in', tones[tone])}
    >
      {icon && <div className={cx('mt-0.5 shrink-0', iconTones[tone])}>{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {children && <div className="mt-0.5 text-xs text-muted">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
