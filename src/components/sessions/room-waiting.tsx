"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, DoorClosed, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import type { SessionWaitingInfo } from "@/server/services/sessions/room-service";

// Q-8 (changed): before the room opens (15 minutes before the start) the participants wait here.
// When the countdown reaches zero the page asks the server again and the room appears.

interface RoomWaitingProps {
  info: SessionWaitingInfo;
  timezone: string;
}

function splitWait(ms: number): { days: number; clock: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    days: Math.floor(total / 86_400),
    clock: `${two(Math.floor((total % 86_400) / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`,
  };
}

export function RoomWaiting({ info, timezone }: RoomWaitingProps) {
  const router = useRouter();
  const opensAtMs = new Date(info.opensAt).getTime();
  // null until mounted, so server and client render the same placeholder (no hydration mismatch).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let refreshed = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (!refreshed && current >= opensAtMs) {
        refreshed = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [opensAtMs, router]);

  const wait = now === null ? null : splitWait(opensAtMs - now);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <ButtonLink href="/sessions" variant="ghost" size="sm">
        <ArrowRight className="size-4 me-1.5" />
        <span>العودة للجلسات</span>
      </ButtonLink>

      <Card className="p-6 sm:p-8 text-center">
        <CardContent className="space-y-5">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-soft text-cyan-ink">
            <DoorClosed className="size-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-fg">الغرفة لم تُفتح بعد</h1>
            <p className="text-sm text-muted">تُفتح غرفة الجلسة قبل موعدها بـ 15 دقيقة، وتنتقل إليها هذه الصفحة تلقائياً.</p>
          </div>

          <div className="rounded-2xl border border-line bg-raised px-4 py-3">
            <span className="block text-xs text-muted">تُفتح الغرفة بعد</span>
            <div className="flex items-baseline justify-center gap-2 text-fg">
              {wait !== null && wait.days > 0 && (
                <span className="text-lg">
                  <bdi dir="ltr" className="cs-num text-3xl font-semibold">{wait.days}</bdi> يوم و
                </span>
              )}
              <bdi dir="ltr" className="cs-num text-3xl font-semibold">
                {wait === null ? "--:--:--" : wait.clock}
              </bdi>
            </div>
          </div>

          <dl className="grid gap-3 text-start text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">المهارة</dt>
              <dd className="font-semibold text-fg">{info.skillName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{info.isTeacher ? "المتعلّم" : "المدرّس"}</dt>
              <dd className="font-semibold text-fg">{info.partnerName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-1.5 text-muted">
                <CalendarClock className="size-4" />
                الموعد
              </dt>
              <dd className="text-fg">
                {formatDateTime(new Date(info.startAt), timezone)}
                <Badge tone="neutral" className="ms-2">
                  <bdi dir="ltr" className="cs-num">{info.durationMinutes}</bdi> دقيقة
                </Badge>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted">هدف الجلسة</dt>
              <dd className="rounded-lg border border-line bg-canvas p-2.5 text-fg leading-relaxed">{info.goal}</dd>
            </div>
          </dl>

          {info.meetingUrl && (
            <a
              href={info.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-ink hover:underline"
            >
              <ExternalLink className="size-3.5" />
              <span>رابط Google Meet للجلسة</span>
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
