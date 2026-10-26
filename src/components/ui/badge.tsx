import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-raised text-muted border-line-strong",
  amber: "bg-amber-soft text-amber-ink border-amber/25",
  cyan: "bg-cyan-soft text-cyan-ink border-cyan/25",
  success: "bg-success-soft text-success border-success/25",
  danger: "bg-danger-soft text-danger border-danger/25",
} as const;

export type BadgeTone = keyof typeof tones;

interface BadgeProps extends ComponentProps<"span"> {
  tone?: BadgeTone;
  /** Small status dot at the inline start. */
  dot?: boolean;
  /** Animate the dot (live states such as "in progress"). */
  pulse?: boolean;
}

export function Badge({ tone = "neutral", dot, pulse, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />}
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
