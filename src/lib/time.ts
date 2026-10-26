// Time-as-currency helpers. Balances are integer minutes; hours exist only for display.
// Display convention (used everywhere): Latin digits, up to 2 decimals, "ساعة",
// e.g. 90 → "1.5 ساعة", 120 → "2 ساعة", −30 → "−0.5 ساعة".

export const MINUTES_PER_HOUR = 60;

const MINUS = "−"; // typographic minus, reads better than "-" next to Arabic text

const hoursFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

export function assertMinutes(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Time amounts must be integer minutes, got ${value}`);
  }
  return value;
}

/** Converts whole/half hours from user input to minutes. Rejects anything that is not a whole minute. */
export function hoursToMinutes(hours: number): number {
  return assertMinutes(Math.round(hours * MINUTES_PER_HOUR * 1e6) / 1e6);
}

/** "1.5" — magnitude only, no sign, no unit. */
export function formatHoursNumber(minutes: number): string {
  assertMinutes(minutes);
  return hoursFormatter.format(Math.abs(minutes) / MINUTES_PER_HOUR);
}

export interface FormatTimeAmountOptions {
  /** Prefix "+" for positive values (ledger rows). Negative values always get "−". */
  signed?: boolean;
}

/** "1.5 ساعة" / "+2 ساعة" / "−0.5 ساعة" */
export function formatTimeAmount(minutes: number, { signed = false }: FormatTimeAmountOptions = {}): string {
  return `${signPrefix(minutes, signed)}${formatHoursNumber(minutes)} ساعة`;
}

export function signPrefix(minutes: number, signed: boolean): string {
  if (minutes < 0) return MINUS;
  if (signed && minutes > 0) return "+";
  return "";
}

/** "90 دقيقة" — used as a precise secondary label / tooltip. */
export function formatMinutes(minutes: number): string {
  assertMinutes(minutes);
  return `${hoursFormatter.format(minutes)} دقيقة`;
}

// ── Time zones (FR-1.4): store UTC, display in the viewer's IANA zone ──────────

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Arabic month/day names with Latin digits, in the given IANA zone. */
export function formatDateTime(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat("ar-u-nu-latn", { ...options, timeZone }).format(instant);
}
