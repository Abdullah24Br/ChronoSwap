"use client";

import { ArrowLeft, ArrowLeftRight, CalendarPlus, Check, CircleAlert, Hourglass, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionStatusBadge } from "@/components/ui/session-status-badge";
import { TimeAmount } from "@/components/ui/time-amount";
import { useToast } from "@/components/ui/toast";
import { BARTER_CYCLE_STATUS_META, BARTER_DECISION_META } from "@/lib/barter-status";
import { cn } from "@/lib/cn";
import { SESSION_DURATIONS, type SessionDuration } from "@/lib/rules";
import { formatDateTime } from "@/lib/time";
import { proposeBarterCycleAction, respondBarterProposalAction } from "@/server/actions/barter";
import type { BarterOverview, BarterOverviewCycle } from "@/server/services/barter/barter-overview";
import type { ThreeWayCycleMatch } from "@/server/services/barter/barter-service";

interface BarterHubProps {
  timezone: string;
  suggestions: ThreeWayCycleMatch[];
  userOfferedCount: number;
  userWantedCount: number;
  overview: BarterOverview;
}

const OPEN_STATUSES = new Set(["PROPOSED", "ACTIVE"]);
const membersKey = (ids: string[]) => [...ids].sort().join("|");

export function BarterHub({ timezone, suggestions, userOfferedCount, userWantedCount, overview }: BarterHubProps) {
  // Hide suggestions that already have an open cycle with the same three people.
  const openKeys = new Set(
    overview.cycles
      .filter((c) => OPEN_STATUSES.has(c.status))
      .map((c) => membersKey(c.participants.map((p) => p.userId))),
  );
  const freshSuggestions = suggestions.filter(
    (s) => !openKeys.has(membersKey(s.participants.map((p) => p.userId))),
  );

  return (
    <div className="space-y-10">
      {overview.inDebt && (
        <div className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            عليك دين من حلقة مقايضة سابقة. لا يمكنك اقتراح حلقات جديدة أو الانضمام إليها أو طلب جلسات حتى
            تسدّده، ويُقتطع تلقائياً من أول ساعات تكسبها بالتدريس.{" "}
            <Link href="/wallet" className="font-semibold underline underline-offset-4">
              عرض المحفظة
            </Link>
          </p>
        </div>
      )}

      <section className="space-y-4" aria-labelledby="my-cycles">
        <h2 id="my-cycles" className="text-lg font-bold text-fg">
          حلقاتي
        </h2>
        {overview.cycles.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight />}
            title="لا توجد حلقات بعد"
            description="اقترح إحدى الحلقات المقترحة أدناه، أو انتظر أن يضمّك أحدهم إلى حلقة."
          />
        ) : (
          <div className="grid gap-4">
            {overview.cycles.map((cycle) => (
              <MyCycleCard key={cycle.id} cycle={cycle} timezone={timezone} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="suggested-cycles">
        <div>
          <h2 id="suggested-cycles" className="flex items-center gap-2 text-lg font-bold text-fg">
            <Sparkles className="size-5 text-amber" />
            حلقات مقترحة لك
          </h2>
          <p className="mt-1 text-sm text-muted">
            وجدنا مستخدمَين يكمّلان معك حلقة: أنت تعلّم الأول، والأول يعلّم الثاني، والثاني يعلّمك.
          </p>
        </div>

        {userOfferedCount === 0 || userWantedCount === 0 ? (
          <EmptyState
            icon={<UserRound />}
            title="أكمل مصفوفة مهاراتك أولاً"
            description="نحتاج مهارة واحدة على الأقل تعرضها وأخرى تطلبها لنبني لك حلقات المقايضة."
            action={
              <ButtonLink href="/profile" variant="outline" size="sm">
                تعديل الملف الشخصي
              </ButtonLink>
            }
          />
        ) : freshSuggestions.length === 0 ? (
          <EmptyState
            icon={<Hourglass />}
            title="لا توجد حلقات جديدة حالياً"
            description="سنعرض لك الحلقات هنا فور انضمام مستخدمين تتكامل مهاراتهم مع مهاراتك."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {freshSuggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} disabled={overview.inDebt} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Suggested cycle (FR-3.3) ────────────────────────────────────────────────

function SuggestionCard({ suggestion, disabled }: { suggestion: ThreeWayCycleMatch; disabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [duration, setDuration] = useState<SessionDuration>(60);
  const [isPending, startTransition] = useTransition();
  const [me, b, c] = suggestion.participants;

  const propose = () =>
    startTransition(async () => {
      // FR-3.4: the proposer accepts implicitly; the other two must agree on this duration.
      const res = await proposeBarterCycleAction({
        durationMinutes: duration,
        participants: suggestion.participants.map((p) => ({
          userId: p.userId,
          teachesSkillId: p.teachesSkill.id,
        })),
      });
      if (!res.ok) {
        toast({ tone: "danger", title: "تعذّر إرسال الاقتراح", description: res.error.message });
        return;
      }
      toast({ tone: "success", title: "أُرسل اقتراح الحلقة", description: "بانتظار موافقة الطرفين الآخرين." });
      router.refresh();
    });

  return (
    <Card accent="split">
      <CardContent className="space-y-4 p-5">
        <ol className="space-y-2.5 text-sm">
          <Leg teacher="أنت" learner={b.displayName} skill={me.teachesSkill.nameAr} tone="amber" />
          <Leg teacher={b.displayName} learner={c.displayName} skill={b.teachesSkill.nameAr} />
          <Leg teacher={c.displayName} learner="أنت" skill={c.teachesSkill.nameAr} tone="cyan" />
        </ol>

        <div className="space-y-2">
          <p className="text-xs text-muted">مدة موحّدة للجلسات الثلاث</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="مدة الجلسات">
            {SESSION_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={duration === d}
                onClick={() => setDuration(d)}
                className={cn(
                  "h-8 rounded-lg border px-3 text-sm transition-colors",
                  duration === d
                    ? "border-amber bg-amber-soft text-amber-ink"
                    : "border-line-strong text-muted hover:bg-raised hover:text-fg",
                )}
              >
                <TimeAmount minutes={d} size="sm" tone={duration === d ? "amber" : "muted"} />
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          className="w-full"
          loading={isPending}
          disabled={disabled || isPending}
          onClick={propose}
          icon={<ArrowLeftRight className="size-4" />}
        >
          اقترح الحلقة على الطرفين
        </Button>
      </CardContent>
    </Card>
  );
}

function Leg({
  teacher,
  learner,
  skill,
  tone,
  trailing,
}: {
  teacher: string;
  learner: string;
  skill: string;
  tone?: "amber" | "cyan";
  trailing?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={cn("font-semibold", tone === "amber" ? "text-amber-ink" : "text-fg")}>{teacher}</span>
      <span className="text-muted">يعلّم</span>
      <span className={cn("font-semibold", tone === "cyan" ? "text-cyan-ink" : "text-fg")}>{learner}</span>
      <ArrowLeft className="size-3.5 text-subtle" aria-hidden />
      <Badge tone={tone ?? "neutral"}>{skill}</Badge>
      {trailing && <span className="ms-auto">{trailing}</span>}
    </li>
  );
}

// ── My cycle (FR-3.4) ───────────────────────────────────────────────────────

function MyCycleCard({ cycle, timezone }: { cycle: BarterOverviewCycle; timezone: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const status = BARTER_CYCLE_STATUS_META[cycle.status];
  const myId = cycle.participants.find((p) => p.isMe)?.userId;
  const nameOf = (id: string, name: string) => (id === myId ? "أنت" : name);

  const respond = (decision: "ACCEPTED" | "DECLINED") =>
    startTransition(async () => {
      const res = await respondBarterProposalAction({ cycleId: cycle.id, decision });
      if (!res.ok) {
        toast({ tone: "danger", title: "تعذّر تسجيل ردّك", description: res.error.message });
        return;
      }
      toast({
        tone: decision === "ACCEPTED" ? "success" : "info",
        title: decision === "ACCEPTED" ? "سُجّلت موافقتك" : "رفضت الحلقة",
      });
      router.refresh();
    });

  return (
    <Card accent={cycle.status === "ACTIVE" ? "cyan" : cycle.status === "PROPOSED" ? "amber" : undefined}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} dot pulse={status.live}>
              {status.label}
            </Badge>
            <span className="text-sm text-muted">
              مدة كل جلسة: <TimeAmount minutes={cycle.durationMinutes} size="sm" />
            </span>
          </div>
          <span className="text-xs text-subtle">
            {cycle.status === "PROPOSED" && <>آخر موعد للرد: {formatDateTime(cycle.respondByAt, timezone)}</>}
            {cycle.status === "ACTIVE" && cycle.scheduleByAt && (
              <>آخر موعد لحجز الجلسات: {formatDateTime(cycle.scheduleByAt, timezone)}</>
            )}
            {!OPEN_STATUSES.has(cycle.status) && <>اقتُرحت في {formatDateTime(cycle.proposedAt, timezone)}</>}
          </span>
        </div>

        <ol className="space-y-2.5 text-sm">
          {cycle.legs.map((leg) => {
            const iTeach = leg.teacher.id === myId;
            const iLearn = leg.learner.id === myId;
            const mine = iTeach || iLearn; // only participants of a session may open its room
            return (
              <Leg
                key={leg.teacher.id}
                teacher={nameOf(leg.teacher.id, leg.teacher.displayName)}
                learner={nameOf(leg.learner.id, leg.learner.displayName)}
                skill={leg.skill.nameAr}
                tone={iTeach ? "amber" : iLearn ? "cyan" : undefined}
                trailing={
                  leg.session ? (
                    mine ? (
                      <Link href={`/sessions/${leg.session.id}`} className="inline-flex">
                        <SessionStatusBadge status={leg.session.status} />
                      </Link>
                    ) : (
                      <SessionStatusBadge status={leg.session.status} />
                    )
                  ) : cycle.status === "ACTIVE" ? (
                    <span className="text-xs text-subtle">لم تُحجز بعد</span>
                  ) : null
                }
              />
            );
          })}
        </ol>

        {cycle.status === "PROPOSED" && (
          <div className="flex flex-wrap gap-2">
            {cycle.participants.map((p) => {
              const decision = BARTER_DECISION_META[p.decision];
              return (
                <Badge key={p.userId} tone={decision.tone}>
                  {p.isMe ? "أنت" : p.displayName}: {decision.label}
                </Badge>
              );
            })}
          </div>
        )}

        {cycle.canRespond && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={isPending}
              disabled={isPending}
              onClick={() => respond("ACCEPTED")}
              icon={<Check className="size-4" />}
            >
              أوافق على الحلقة والمدة
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => respond("DECLINED")}
              icon={<X className="size-4" />}
            >
              أرفض
            </Button>
          </div>
        )}

        {cycle.bookMyLeg && (
          <ButtonLink
            href={`/sessions/new?teacherId=${cycle.bookMyLeg.teacherId}&cycleId=${cycle.id}&skillId=${cycle.bookMyLeg.skillId}`}
            variant="accent"
            size="sm"
            icon={<CalendarPlus className="size-4" />}
          >
            احجز جلستك في هذه الحلقة
          </ButtonLink>
        )}
      </CardContent>
    </Card>
  );
}
