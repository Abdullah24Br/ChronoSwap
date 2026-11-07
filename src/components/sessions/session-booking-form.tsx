"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { minutesToTimeString, WEEKDAYS } from "@/lib/time";
import { requestSessionAction } from "@/server/actions/sessions";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  Wallet,
} from "lucide-react";

interface TeacherInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
  offeredSkills: {
    id: string;
    slug: string;
    nameAr: string;
    categoryNameAr: string;
  }[];
  availabilitySlots: {
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[];
}

interface SessionBookingFormProps {
  teacher: TeacherInfo;
  learnerAvailableMinutes: number;
  learnerDebtMinutes: number;
  isBarter?: boolean;
  barterCycleId?: string;
  defaultSkillId?: string;
  /** FR-3.4: barter sessions use the cycle's agreed duration and skill. */
  lockedDurationMinutes?: 30 | 60 | 90 | 120;
}

export function SessionBookingForm({
  teacher,
  learnerAvailableMinutes,
  learnerDebtMinutes,
  isBarter = false,
  barterCycleId,
  defaultSkillId,
  lockedDurationMinutes,
}: SessionBookingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [skillId, setSkillId] = useState(
    defaultSkillId ?? teacher.offeredSkills[0]?.id ?? "",
  );
  const [durationMinutes, setDurationMinutes] = useState<30 | 60 | 90 | 120>(
    lockedDurationMinutes ?? 60,
  );
  const [startAtString, setStartAtString] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasDebt = learnerDebtMinutes > 0;
  const hasInsufficientBalance =
    !isBarter && learnerAvailableMinutes < durationMinutes;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!skillId) {
      setError("يرجى اختيار المهارة المطلوبة للجلسة");
      return;
    }

    if (!startAtString) {
      setError("يرجى اختيار موعد وتاريخ بدء الجلسة");
      return;
    }

    const startAt = new Date(startAtString);
    if (isNaN(startAt.getTime()) || startAt <= new Date()) {
      setError("موعد بدء الجلسة يجب أن يكون تاريخاً صحيحاً في المستقبل");
      return;
    }

    if (goal.trim().length < 5) {
      setError("يرجى وصف هدف الجلسة في 5 أحرف على الأقل");
      return;
    }

    startTransition(async () => {
      const res = await requestSessionAction({
        teacherId: teacher.id,
        skillId,
        durationMinutes,
        startAt,
        goal: goal.trim(),
        barterCycleId,
      });

      if (!res.ok) {
        setError(res.error.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(isBarter ? "/barter" : "/sessions");
        router.refresh();
      }, 2000);
    });
  };

  if (success) {
    return (
      <Card className="border-success/30 bg-success/5 p-8 text-center max-w-xl mx-auto">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">تم إرسال طلب الحجز بنجاح!</h2>
          <p className="text-sm text-muted max-w-md">
            تم تجميد ساعات الجلسة في محفظتك بأمان. سيتم إشعار المدرّس بالطلب للرد عليه بالقبول أو الرفض.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
      {/* Teacher Summary Banner */}
      <Card className="overflow-hidden border-line">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-amber-ink font-bold text-lg">
              {teacher.displayName.slice(0, 1)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-fg text-base">{teacher.displayName}</h3>
                {isBarter ? (
                  <Badge tone="cyan">جلسة مقايضة</Badge>
                ) : (
                  <Badge tone="neutral">مدرّس معتمد</Badge>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                المنطقة الزمنية: {teacher.timezone}
              </p>
            </div>
          </div>

          <div className="text-end">
            <span className="text-xs text-subtle block">رصيدك المتاح:</span>
            <span className="text-sm font-bold font-mono text-amber-ink">
              {learnerAvailableMinutes} دقيقة
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Debt Warning */}
      {hasDebt && (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-semibold">تنبيه: لديك ديون غير مسددة ({learnerDebtMinutes} دقيقة)</strong>
            <span>لا يمكنك حجز جلسات تعليمية جديدة حتى سداد الديون السابقة عبر تدريس مستخدمين آخرين.</span>
          </div>
        </div>
      )}

      {/* Main Booking Fields Card */}
      <Card>
        <CardHeader className="pb-3 border-b border-line">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-fg">
            <GraduationCap className="size-4 text-amber" />
            <span>تفاصيل حجز الجلسة</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {/* Skill Selector */}
          <div>
            <label htmlFor="skill-select" className="block text-xs font-semibold text-fg mb-1.5">
              المهارة المطلوبة للتعلم *
            </label>
            <select
              id="skill-select"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              disabled={isBarter}
              className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm text-fg transition-colors hover:border-line-strong focus:border-amber focus:outline-none"
              required
            >
              {teacher.offeredSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr} ({s.categoryNameAr})
                </option>
              ))}
            </select>
          </div>

          {/* Duration Selector */}
          <div>
            <label className="block text-xs font-semibold text-fg mb-1.5">
              مدة الجلسة المحجوزة *
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {([30, 60, 90, 120] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationMinutes(d)}
                  disabled={lockedDurationMinutes !== undefined && d !== lockedDurationMinutes}
                  className={`rounded-lg border py-2.5 text-center text-sm font-semibold transition-all cursor-pointer ${
                    durationMinutes === d
                      ? "border-amber bg-amber-soft text-amber-ink ring-2 ring-amber/20"
                      : "border-line bg-canvas text-muted hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                  }`}
                >
                  <span className="block font-mono">{d}</span>
                  <span className="text-[0.7rem] font-normal">دقيقة</span>
                </button>
              ))}
            </div>
          </div>

          {/* Teacher Weekly Availability Reference */}
          <div className="rounded-xl bg-raised/50 border border-line p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
              <Calendar className="size-3.5 text-cyan-ink" />
              <span>مواعيد المدرّس الأسبوعية المتاحة:</span>
            </div>
            {teacher.availabilitySlots.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {Array.from(new Set(teacher.availabilitySlots.map((s) => s.weekday)))
                  .sort((a, b) => a - b)
                  .map((dayIdx) => {
                    const dayName = WEEKDAYS.find((d) => d.index === dayIdx)?.nameAr;
                    const slots = teacher.availabilitySlots.filter((s) => s.weekday === dayIdx);
                    return (
                      <span
                        key={dayIdx}
                        className="inline-flex items-center gap-1 rounded bg-canvas px-2.5 py-1 border border-line text-fg"
                      >
                        <strong className="text-amber-ink">{dayName}:</strong>
                        <span className="font-mono text-muted text-[0.75rem]">
                          {slots
                            .map((s) => `${minutesToTimeString(s.startMinute)}–${minutesToTimeString(s.endMinute)}`)
                            .join(", ")}
                        </span>
                      </span>
                    );
                  })}
              </div>
            ) : (
              <p className="text-xs text-subtle italic">لم يحدد مواعيد أسبوعية بعد</p>
            )}
          </div>

          {/* DateTime Picker */}
          <div>
            <label htmlFor="session-datetime" className="block text-xs font-semibold text-fg mb-1.5">
              تاريخ ووقت بدء الجلسة *
            </label>
            <Input
              id="session-datetime"
              type="datetime-local"
              value={startAtString}
              onChange={(e) => setStartAtString(e.target.value)}
              className="text-start font-mono text-sm"
              required
            />
            <p className="text-xs text-subtle mt-1">
              يجب أن يقع الموعد بالكامل ضمن الأوقات المتاحة للمدرّس أعلاه بتوقيته المحلي ({teacher.timezone}).
            </p>
          </div>

          {/* Session Goal Textarea */}
          <div>
            <label htmlFor="session-goal" className="block text-xs font-semibold text-fg mb-1.5">
              هدف الجلسة وما ترغب في تعلّمه *
            </label>
            <textarea
              id="session-goal"
              value={goal}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setGoal(e.target.value)}
              placeholder="مثال: أريد شرح المفاهيم الأساسية للـ State Management في React وكيفية التعامل مع الـ Redux Toolkit مع تطبيق عملي بسيط..."
              rows={4}
              maxLength={500}
              className="w-full rounded-lg border border-line bg-canvas p-3 text-sm text-fg transition-colors hover:border-line-strong focus:border-amber focus:outline-none resize-y"
              required
            />
            <div className="flex justify-between items-center text-xs text-subtle mt-1">
              <span className="flex items-center gap-1">
                <Sparkles className="size-3 text-amber" />
                <span>سيُستخدم هذا الهدف لتوليد خطة الأجندة الذكية للجلسة عبر الذكاء الاصطناعي.</span>
              </span>
              <span>{goal.length}/500</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Escrow & Payment Preview */}
      <Card className="bg-raised/30 border-line">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Wallet className="size-4 text-amber-ink" />
            <div className="text-xs">
              <span className="font-semibold text-fg block">
                {isBarter ? "جلسة ضمن حلقة مقايضة (دون تجميد رصيد)" : "تجميد الضمان (Escrow Freeze)"}
              </span>
              <span className="text-subtle">
                {isBarter
                  ? "كل طرف في الحلقة يعطي من الساعات بقدر ما يأخذ"
                  : `سيتم تجميد ${durationMinutes} دقيقة حتى انتهاء الجلسة وتقييمها بنجاح`}
              </span>
            </div>
          </div>

          <div className="text-end">
            <span className="text-xs text-subtle block">التكلفة:</span>
            <span className="text-base font-bold font-mono text-fg">
              {isBarter ? "0 دقيقة" : `${durationMinutes} دقيقة`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full font-bold"
        disabled={isPending || hasDebt || hasInsufficientBalance}
      >
        {isPending
          ? "جارٍ إرسال الطلب..."
          : hasInsufficientBalance
          ? "رصيدك المتاح غير كافٍ لهذه المدة"
          : hasDebt
          ? "غير متاح لوجود ديون غير مسددة"
          : isBarter
          ? "تأكيد طلب جلسة المقايضة"
          : `تأكيد حجز الجلسة وتجميد ${durationMinutes} دقيقة`}
      </Button>
    </form>
  );
}
