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

// ── Availability slots & week calendar (FR-1.4) ───────────────────────────────

export interface WeekdayInfo {
  index: number;
  nameAr: string;
  nameEn: string;
}

export const WEEKDAYS: readonly WeekdayInfo[] = [
  { index: 0, nameAr: "الأحد", nameEn: "Sunday" },
  { index: 1, nameAr: "الإثنين", nameEn: "Monday" },
  { index: 2, nameAr: "الثلاثاء", nameEn: "Tuesday" },
  { index: 3, nameAr: "الأربعاء", nameEn: "Wednesday" },
  { index: 4, nameAr: "الخميس", nameEn: "Thursday" },
  { index: 5, nameAr: "الجمعة", nameEn: "Friday" },
  { index: 6, nameAr: "السبت", nameEn: "Saturday" },
] as const;

/** Converts minute of day (e.g. 540) to 24h format "09:00". */
export function minutesToTimeString(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.floor(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Converts "09:00" or "13:30" string to minutes from midnight (0..1440). */
export function timeStringToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length !== 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return Math.max(0, Math.min(1440, h * 60 + m));
}

export interface SlotRange {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Checks whether any two slots on the same weekday overlap. */
export function hasOverlappingSlots(slots: SlotRange[]): boolean {
  const byDay = new Map<number, SlotRange[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.weekday) ?? [];
    list.push(slot);
    byDay.set(slot.weekday, list);
  }

  for (const daySlots of byDay.values()) {
    // Sort by startMinute
    const sorted = [...daySlots].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].endMinute > sorted[i + 1].startMinute) {
        return true;
      }
    }
  }

  return false;
}
