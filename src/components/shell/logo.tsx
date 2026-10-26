import { cn } from "@/lib/cn";

/** A coin split in two halves (amber = giving, cyan = receiving) with a clock hand: time as currency. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--cs-line-strong)" />
      <path d="M16 3.5a12.5 12.5 0 0 1 0 25" fill="none" stroke="var(--cs-amber)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 28.5a12.5 12.5 0 0 1 0-25" fill="none" stroke="var(--cs-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 16V9.5M16 16l4.5 3" stroke="var(--cs-fg)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.6" fill="var(--cs-fg)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight" dir="ltr">
        Chrono<span className="text-amber-ink">Swap</span>
      </span>
    </span>
  );
}
