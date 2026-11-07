"use client";

import { useState, useTransition } from "react";
import { updateAvailabilityAction } from "@/server/actions/availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatMinutes,
  hasOverlappingSlots,
  minutesToTimeString,
  timeStringToMinutes,
  WEEKDAYS,
  type SlotRange,
} from "@/lib/time";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Globe,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

const COMMON_TIMEZONES = [
  { value: "Asia/Damascus", label: "دمشق (Asia/Damascus)" },
  { value: "Asia/Riyadh", label: "الرياض (Asia/Riyadh)" },
  { value: "Africa/Cairo", label: "القاهرة (Africa/Cairo)" },
  { value: "Asia/Dubai", label: "دبي (Asia/Dubai)" },
  { value: "Asia/Amman", label: "عمّان (Asia/Amman)" },
  { value: "Asia/Beirut", label: "بيروت (Asia/Beirut)" },
  { value: "Asia/Baghdad", label: "بغداد (Asia/Baghdad)" },
  { value: "Europe/Berlin", label: "برلين (Europe/Berlin)" },
  { value: "Europe/London", label: "لندن (Europe/London)" },
  { value: "Europe/Istanbul", label: "إسطنبول (Europe/Istanbul)" },
  { value: "America/New_York", label: "نيويورك (America/New_York)" },
  { value: "UTC", label: "التوقيت العالمي الموحد (UTC)" },
] as const;

interface AvailabilityEditorProps {
  initialTimezone: string;
  initialSlots: SlotRange[];
}

export function AvailabilityEditor({ initialTimezone, initialSlots }: AvailabilityEditorProps) {
  const [timezone, setTimezone] = useState(initialTimezone || "Asia/Damascus");
  const [slots, setSlots] = useState<SlotRange[]>(initialSlots);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Helper: auto-detect user's local browser timezone
  const handleDetectTimezone = () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        setTimezone(detected);
        setSaveSuccess(false);
      }
    } catch {
      // ignore
    }
  };

  // Add a default slot (09:00 - 13:00) for a given day
  const addSlot = (weekday: number) => {
    setSaveSuccess(false);
    setErrorMessage(null);
    setSlots((prev) => {
      // Find latest end minute on this day or default to 09:00 (540m)
      const daySlots = prev.filter((s) => s.weekday === weekday);
      let start = 540; // 09:00
      let end = 780; // 13:00

      if (daySlots.length > 0) {
        const last = daySlots.sort((a, b) => b.endMinute - a.endMinute)[0];
        if (last.endMinute + 60 <= 1380) {
          start = last.endMinute + 60;
          end = Math.min(1440, start + 180);
        }
      }

      return [...prev, { weekday, startMinute: start, endMinute: end }];
    });
  };

  // Remove a specific slot
  const removeSlot = (weekday: number, indexOnDay: number) => {
    setSaveSuccess(false);
    setErrorMessage(null);
    setSlots((prev) => {
      let count = 0;
      return prev.filter((s) => {
        if (s.weekday === weekday) {
          if (count === indexOnDay) {
            count++;
            return false;
          }
          count++;
        }
        return true;
      });
    });
  };

  // Update start or end minute of a specific slot
  const updateSlot = (
    weekday: number,
    indexOnDay: number,
    field: "startMinute" | "endMinute",
    timeStr: string,
  ) => {
    setSaveSuccess(false);
    setErrorMessage(null);
    const newMinute = timeStringToMinutes(timeStr);

    setSlots((prev) => {
      let count = 0;
      return prev.map((s) => {
        if (s.weekday === weekday) {
          if (count === indexOnDay) {
            count++;
            return { ...s, [field]: newMinute };
          }
          count++;
        }
        return s;
      });
    });
  };

  const handleSave = () => {
    setErrorMessage(null);
    setSaveSuccess(false);

    // Validate intervals
    for (const s of slots) {
      if (s.startMinute >= s.endMinute) {
        const day = WEEKDAYS.find((w) => w.index === s.weekday)?.nameAr;
        setErrorMessage(`يوم ${day}: وقت البداية يجب أن يسبق وقت النهاية`);
        return;
      }
    }

    // Validate overlap
    if (hasOverlappingSlots(slots)) {
      setErrorMessage("توجد فترات زمنية متداخلة في نفس اليوم. يرجى تعديلها قبل الحفظ.");
      return;
    }

    startTransition(async () => {
      const res = await updateAvailabilityAction({
        timezone,
        slots,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setSaveSuccess(true);
      }
    });
  };

  // Total available hours per week
  const totalWeeklyMinutes = slots.reduce((acc, s) => acc + Math.max(0, s.endMinute - s.startMinute), 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="size-5 text-amber" />
              <span>الأوقات المتاحة لاستقبال الجلسات</span>
            </CardTitle>
            <CardDescription>
              حدّد فتراتك المتاحة أسبوعياً لاستقبال طلبات المقايضة والتعليم
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              إجمالي التوفر: <strong className="text-amber-ink font-semibold">{formatMinutes(totalWeeklyMinutes)}</strong> أسبوعياً
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Timezone Selector */}
        <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <label htmlFor="timezone-select" className="text-sm font-medium text-fg flex items-center gap-2">
                <Globe className="size-4 text-cyan" />
                <span>المنطقة الزمنية (Timezone)</span>
              </label>
              <p className="text-xs text-muted mt-0.5">
                تُخزَّن المواعيد بالتوقيت العالمي UTC وتُعرض لك وللطلاب بتوقيتهم المحلي
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="timezone-select"
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  setSaveSuccess(false);
                }}
                className="h-10 rounded-lg border border-line bg-raised px-3 text-sm text-fg outline-none focus:border-cyan"
                dir="ltr"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
                {!COMMON_TIMEZONES.some((tz) => tz.value === timezone) && (
                  <option value={timezone}>{timezone}</option>
                )}
              </select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDetectTimezone}
                title="تحديد منطقتي تلقائياً من المتصفح"
              >
                تلقائي
              </Button>
            </div>
          </div>
        </div>

        {/* Feedback banners */}
        {errorMessage && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-success font-medium">
            <CheckCircle2 className="size-5 shrink-0" />
            <span>تم حفظ الأوقات المتاحة بنجاح! سيتمكن الطلاب من حجز هذه الأوقات وفق منطقتهم الزمنية.</span>
          </div>
        )}

        {/* 7-Day Schedule List */}
        <div className="space-y-3">
          {WEEKDAYS.map((day) => {
            const daySlots = slots.filter((s) => s.weekday === day.index);
            const isDayActive = daySlots.length > 0;

            return (
              <div
                key={day.index}
                className={`rounded-xl border p-4 transition-colors ${
                  isDayActive ? "border-line-strong bg-surface" : "border-line bg-raised/30 opacity-75"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-line">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-fg w-20">{day.nameAr}</span>
                    <span className="text-xs text-subtle" dir="ltr">
                      ({day.nameEn})
                    </span>
                    {isDayActive ? (
                      <span className="text-xs text-amber-ink font-medium">
                        {daySlots.length} {daySlots.length === 1 ? "فترة متاحة" : "فترات متاحة"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">غير متاح</span>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant={isDayActive ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => addSlot(day.index)}
                    icon={<Plus className="size-3.5" />}
                    className="text-xs self-start sm:self-auto"
                  >
                    إضافة فترة
                  </Button>
                </div>

                {/* Day's Time Intervals */}
                {daySlots.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {daySlots.map((slot, idx) => {
                      const duration = Math.max(0, slot.endMinute - slot.startMinute);
                      const isInvalid = slot.startMinute >= slot.endMinute;

                      return (
                        <div
                          key={idx}
                          className={`flex flex-wrap items-center gap-3 rounded-lg border p-2 text-sm ${
                            isInvalid
                              ? "border-danger/60 bg-danger-soft/40"
                              : "border-line bg-raised/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="size-4 text-subtle" />
                            <span className="text-xs text-muted">من</span>
                            <input
                              type="time"
                              dir="ltr"
                              value={minutesToTimeString(slot.startMinute)}
                              onChange={(e) =>
                                updateSlot(day.index, idx, "startMinute", e.target.value)
                              }
                              className="h-8 rounded border border-line bg-surface px-2 text-xs font-mono text-fg outline-none focus:border-cyan"
                            />
                            <span className="text-xs text-muted">إلى</span>
                            <input
                              type="time"
                              dir="ltr"
                              value={minutesToTimeString(slot.endMinute)}
                              onChange={(e) =>
                                updateSlot(day.index, idx, "endMinute", e.target.value)
                              }
                              className="h-8 rounded border border-line bg-surface px-2 text-xs font-mono text-fg outline-none focus:border-cyan"
                            />
                          </div>

                          <div className="flex items-center gap-2 ms-auto">
                            {!isInvalid && (
                              <span className="text-xs text-muted">
                                ({formatMinutes(duration)})
                              </span>
                            )}
                            {isInvalid && (
                              <span className="text-xs text-danger font-medium">
                                النهاية تسبق البداية!
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeSlot(day.index, idx)}
                              className="rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger transition-colors"
                              title="حذف الفترة"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-line">
          <p className="text-xs text-muted">
            التغييرات تحفظ مباشرة في ملفك الشخصي وتُعتمد في استقبال حجوزات الجلسات.
          </p>
          <Button
            variant="primary"
            size="md"
            loading={isPending}
            onClick={handleSave}
            icon={<Sparkles className="size-4" />}
          >
            حفظ الأوقات المتاحة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

