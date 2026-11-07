import { cn } from "@/lib/cn";
import { formatHoursNumber, formatMinutes, formatTimeAmount, signPrefix } from "@/lib/time";

// The one way to show a time balance. Input is ALWAYS integer minutes.
// Convention: Latin digits in a mono face, "ساعة" as a quieter unit — "1.5 ساعة".

const sizes = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  xl: "text-4xl md:text-5xl",
} as const;

const tones = {
  default: "text-fg",
  muted: "text-muted",
  amber: "text-amber-ink",
  cyan: "text-cyan-ink",
  danger: "text-danger",
} as const;

interface TimeAmountProps {
  minutes: number;
  size?: keyof typeof sizes;
  /** "auto" = success-ish for credits, danger for debits (ledger rows). */
  tone?: keyof typeof tones | "auto";
  /** Show "+" on positive amounts. */
  signed?: boolean;
  /** Hide the "ساعة" unit (e.g. inside a column already labelled in hours). */
  hideUnit?: boolean;
  className?: string;
}

export function TimeAmount({ minutes, size = "md", tone = "default", signed = false, hideUnit, className }: TimeAmountProps) {
  const resolvedTone =
    tone === "auto" ? (minutes > 0 ? "text-success" : minutes < 0 ? "text-danger" : "text-muted") : tones[tone];

  return (
    <span
      className={cn("inline-flex items-baseline gap-[0.3em] whitespace-nowrap", sizes[size], resolvedTone, className)}
      title={formatMinutes(Math.abs(minutes))}
      aria-label={formatTimeAmount(minutes, { signed })}
    >
      {/* LTR isolate keeps "−1.5" from being reordered by the RTL paragraph. */}
      <bdi
        dir="ltr"
        className="cs-num font-medium leading-none tracking-tight"
        // Big balances count up when they first appear (src/components/motion/motion-layer.tsx).
        data-countup={size === "lg" || size === "xl" ? "" : undefined}
        data-minutes={minutes}
        data-signed={signed ? "true" : undefined}
      >
        {signPrefix(minutes, signed)}
        {formatHoursNumber(minutes)}
      </bdi>
      {!hideUnit && <span className="text-[0.7em] font-normal leading-none opacity-70">ساعة</span>}
    </span>
  );
}
