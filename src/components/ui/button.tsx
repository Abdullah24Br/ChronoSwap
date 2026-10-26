import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-amber text-on-amber shadow-[0_0_0_1px_rgb(255_181_71/0.4),0_8px_24px_-10px_rgb(255_181_71/0.6)] hover:brightness-110",
  accent:
    "bg-cyan text-on-cyan shadow-[0_0_0_1px_rgb(61_224_255/0.4),0_8px_24px_-10px_rgb(61_224_255/0.5)] hover:brightness-110",
  outline: "border border-line-strong bg-transparent text-fg hover:bg-raised",
  ghost: "bg-transparent text-muted hover:bg-raised hover:text-fg",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
} as const;

const sizes = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-10 gap-2 rounded-[0.7rem] px-4 text-[0.95rem]",
  lg: "h-12 gap-2.5 rounded-xl px-6 text-base",
  icon: "size-10 rounded-[0.7rem]",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon placed at the inline start (right in RTL). */
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function buttonClasses({ variant = "primary", size = "md", className }: Omit<CommonProps, "icon" | "children">) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
    "transition-[background-color,filter,color,transform] duration-150 active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent" />;
}

type ButtonProps = CommonProps & Omit<ComponentProps<"button">, keyof CommonProps>;

export function Button({ variant, size, loading, icon, children, className, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = CommonProps & Omit<ComponentProps<typeof Link>, keyof CommonProps>;

export function ButtonLink({ variant, size, icon, children, className, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
