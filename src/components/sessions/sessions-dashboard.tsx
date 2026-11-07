"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FULL_MOTION, REDUCED_MOTION, gsap, useGSAP } from "@/components/motion/gsap";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import {
  cancelAcceptedSessionAction,
  respondSessionRequestAction,
  withdrawSessionRequestAction,
} from "@/server/actions/sessions";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Inbox,
  Send,
  Video,
  XCircle,
} from "lucide-react";

import type { UserSessionRecord } from "@/server/services/sessions/booking-service";

interface SessionsDashboardProps {
  currentUserId: string;
  userTimezone: string;
  incomingRequests: UserSessionRecord[];
  outgoingRequests: UserSessionRecord[];
  upcomingSessions: UserSessionRecord[];
  pastSessions: UserSessionRecord[];
}

export function SessionsDashboard({
  currentUserId,
  userTimezone,
  incomingRequests,
  outgoingRequests,
  upcomingSessions,
  pastSessions,
}: SessionsDashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "incoming" | "outgoing" | "upcoming" | "past"
  >(incomingRequests.length > 0 ? "incoming" : "upcoming");

  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Tab switch: a brass bar glides to the chosen tab and the new list deals itself in.
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      const tabs = tabsRef.current;
      const bar = barRef.current;
      const active = tabs?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (!tabs || !bar || !active) return;
      const vars = { x: active.offsetLeft, width: active.offsetWidth, autoAlpha: 1 };
      const mm = gsap.matchMedia();
      mm.add(FULL_MOTION, () => {
        gsap.to(bar, { ...vars, duration: 0.6, ease: "astro" });
        gsap.fromTo(
          "[data-tab-content] .rounded-card",
          { autoAlpha: 0, y: 34, rotateX: -12, transformPerspective: 900, transformOrigin: "50% 0%" },
          { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.75, ease: "astro", stagger: 0.07, clearProps: "all" },
        );
      });
      mm.add(REDUCED_MOTION, () => gsap.set(bar, vars));
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [activeTab] },
  );
  const [meetingUrlInputs, setMeetingUrlInputs] = useState<Record<string, string>>({});
  const [rejectReasonInputs, setRejectReasonInputs] = useState<Record<string, string>>({});
  const [cancelReasonInputs, setCancelReasonInputs] = useState<Record<string, string>>({});
  const [showRejectFormId, setShowRejectFormId] = useState<string | null>(null);
  const [showAcceptFormId, setShowAcceptFormId] = useState<string | null>(null);
  const [showCancelFormId, setShowCancelFormId] = useState<string | null>(null);

  const handleCancelAccepted = (sessionId: string) => {
    setActionError(null);
    startTransition(async () => {
      const reason = cancelReasonInputs[sessionId] || undefined;
      const res = await cancelAcceptedSessionAction({ sessionId, reason });

      if (!res.ok) {
        setActionError(res.error.message);
        return;
      }

      setShowCancelFormId(null);
      router.refresh();
    });
  };

  const handleAccept = (sessionId: string) => {
    setActionError(null);
    startTransition(async () => {
      const meetingUrl = meetingUrlInputs[sessionId] || undefined;
      const res = await respondSessionRequestAction({
        sessionId,
        decision: "ACCEPTED",
        meetingUrl,
      });

      if (!res.ok) {
        setActionError(res.error.message);
        return;
      }

      setShowAcceptFormId(null);
      router.refresh();
    });
  };

  const handleReject = (sessionId: string) => {
    setActionError(null);
    startTransition(async () => {
      const rejectReason = rejectReasonInputs[sessionId] || undefined;
      const res = await respondSessionRequestAction({
        sessionId,
        decision: "REJECTED",
        rejectReason,
      });

      if (!res.ok) {
        setActionError(res.error.message);
        return;
      }

      setShowRejectFormId(null);
      router.refresh();
    });
  };

  const handleWithdraw = (sessionId: string) => {
    if (!confirm("هل أنت متأكد من رغبتك في إلغاء طلب الجلسة واسترجاع الرصيد فوراً؟")) {
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await withdrawSessionRequestAction({ sessionId });
      if (!res.ok) {
        setActionError(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} data-tab-content data-motion="off" className="space-y-6">
      {/* Global Action Error Alert */}
      {actionError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tabs Bar */}
      <div ref={tabsRef} className="relative flex gap-2 overflow-x-auto border-b border-line pb-px">
        <span
          ref={barRef}
          aria-hidden
          className="invisible absolute bottom-0 h-0.5 rounded-full bg-amber shadow-[0_0_10px_var(--cs-amber)]"
          // Physical left on purpose: GSAP sets x from offsetLeft (works in RTL and LTR).
          style={{ left: 0 }}
        />
        <button
          type="button"
          data-tab="incoming"
          onClick={() => { setActiveTab("incoming"); setActionError(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "incoming"
              ? "border-transparent text-amber-ink bg-amber/5"
              : "border-transparent text-muted hover:text-fg hover:border-line-strong"
          }`}
        >
          <Inbox className="size-4" />
          <span>الطلبات الواردة</span>
          {incomingRequests.length > 0 && (
            <span className="rounded-full bg-amber text-canvas font-mono text-[0.7rem] px-2 py-0.5 font-bold">
              {incomingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          data-tab="outgoing"
          onClick={() => { setActiveTab("outgoing"); setActionError(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "outgoing"
              ? "border-transparent text-amber-ink bg-amber/5"
              : "border-transparent text-muted hover:text-fg hover:border-line-strong"
          }`}
        >
          <Send className="size-4" />
          <span>طلباتي المرسلة</span>
          {outgoingRequests.length > 0 && (
            <span className="rounded-full bg-raised text-fg font-mono text-[0.7rem] px-2 py-0.5 font-medium border border-line">
              {outgoingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          data-tab="upcoming"
          onClick={() => { setActiveTab("upcoming"); setActionError(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "upcoming"
              ? "border-transparent text-amber-ink bg-amber/5"
              : "border-transparent text-muted hover:text-fg hover:border-line-strong"
          }`}
        >
          <Calendar className="size-4" />
          <span>الجلسات القادمة</span>
          {upcomingSessions.length > 0 && (
            <span className="rounded-full bg-cyan-soft text-cyan-ink font-mono text-[0.7rem] px-2 py-0.5 font-bold">
              {upcomingSessions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          data-tab="past"
          onClick={() => { setActiveTab("past"); setActionError(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "past"
              ? "border-transparent text-amber-ink bg-amber/5"
              : "border-transparent text-muted hover:text-fg hover:border-line-strong"
          }`}
        >
          <Clock className="size-4" />
          <span>سجل الجلسات</span>
          <span className="text-subtle text-xs">({pastSessions.length})</span>
        </button>
      </div>

      {/* Tab 1: Incoming Requests (Teacher view) */}
      {activeTab === "incoming" && (
        <div className="space-y-4">
          {incomingRequests.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-line">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-raised text-muted">
                  <Inbox className="size-6" />
                </div>
                <h3 className="font-bold text-fg text-base">لا توجد طلبات واردة حالياً</h3>
                <p className="text-xs text-muted max-w-sm">
                  عندما يطلب أحد المتعلمين حجز جلسة معك في المهارات التي تعرضها، ستظهر طلباته هنا للقبول أو الرفض.
                </p>
              </div>
            </Card>
          ) : (
            incomingRequests.map((req) => (
              <Card key={req.id} className="overflow-hidden border-line hover:border-line-strong transition-all">
                <CardContent className="p-5 sm:p-6 space-y-4">
                  {/* Header: Learner Info, Status, Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-amber-ink font-bold text-base">
                        {req.learner.displayName.slice(0, 1)}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-fg text-base">{req.learner.displayName}</h4>
                          {req.kind === "BARTER" ? (
                            <Badge tone="cyan">مقايضة (0 دقيقة)</Badge>
                          ) : (
                            <Badge tone="amber">مباشرة (رصيد مجمّد)</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                          <span>المنطقة الزمنية للمتعلم: {req.learner.timezone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge tone="neutral" className="text-xs font-mono">
                        {req.durationMinutes} دقيقة
                      </Badge>
                      <Badge tone="amber" className="text-xs">
                        بانتظار ردك
                      </Badge>
                    </div>
                  </div>

                  {/* Booking Details Box */}
                  <div className="rounded-xl bg-raised/50 p-4 border border-line space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-fg">
                        <GraduationCap className="size-4 text-amber" />
                        <span>المهارة المطلوبة: {req.skill.nameAr}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-muted font-mono">
                        <Calendar className="size-3.5 text-cyan-ink" />
                        <span>
                          {formatDateTime(new Date(req.startAt), userTimezone, {
                            dateStyle: "full",
                            timeStyle: "short",
                          })}
                        </span>
                      </span>
                    </div>

                    <div className="pt-2 border-t border-line/60">
                      <strong className="text-subtle block mb-1">هدف الجلسة المطلوب من المتعلم:</strong>
                      <p className="text-fg leading-relaxed bg-canvas p-2.5 rounded-lg border border-line">
                        {req.goal}
                      </p>
                    </div>
                  </div>

                  {/* Accept Form Popdown */}
                  {showAcceptFormId === req.id && (
                    <div className="rounded-xl bg-success/5 border border-success/30 p-4 space-y-3">
                      <h5 className="font-bold text-xs text-fg flex items-center gap-1.5">
                        <Video className="size-4 text-success" />
                        <span>رابط مكالمة الجلسة (اختياري)</span>
                      </h5>
                      <input
                        type="url"
                        placeholder="https://meet.google.com/xyz-abcd-efg"
                        value={meetingUrlInputs[req.id] || ""}
                        onChange={(e) =>
                          setMeetingUrlInputs({
                            ...meetingUrlInputs,
                            [req.id]: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg font-mono placeholder:font-sans focus:border-success focus:outline-none"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAcceptFormId(null)}
                        >
                          إلغاء
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleAccept(req.id)}
                        >
                          تأكيد القبول النهائي
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Reject Form Popdown */}
                  {showRejectFormId === req.id && (
                    <div className="rounded-xl bg-danger/5 border border-danger/30 p-4 space-y-3">
                      <h5 className="font-bold text-xs text-fg flex items-center gap-1.5">
                        <XCircle className="size-4 text-danger" />
                        <span>سبب الرفض (اختياري، سيصل للمتعلم)</span>
                      </h5>
                      <textarea
                        rows={2}
                        placeholder="اعتذر لعدم التفرغ في هذا الموعد، يمكنك اختيار موعد آخر..."
                        value={rejectReasonInputs[req.id] || ""}
                        onChange={(e) =>
                          setRejectReasonInputs({
                            ...rejectReasonInputs,
                            [req.id]: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg placeholder:font-sans focus:border-danger focus:outline-none"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRejectFormId(null)}
                        >
                          إلغاء
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleReject(req.id)}
                        >
                          تأكيد الرفض وإعادة الرصيد
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!showAcceptFormId && !showRejectFormId && (
                    <div className="flex items-center justify-end gap-2.5 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setShowRejectFormId(req.id)}
                        className="text-danger hover:bg-danger/10 border-line"
                      >
                        رفض الطلب
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setShowAcceptFormId(req.id)}
                        icon={<CheckCircle2 className="size-3.5" />}
                      >
                        قبول الطلب
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Outgoing Requests (Learner view) */}
      {activeTab === "outgoing" && (
        <div className="space-y-4">
          {outgoingRequests.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-line">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-raised text-muted">
                  <Send className="size-6" />
                </div>
                <h3 className="font-bold text-fg text-base">لا توجد طلبات مرسلة معلّقة</h3>
                <p className="text-xs text-muted max-w-sm mb-2">
                  عندما ترسل طلب حجز جلسة لمدرّس، ستتمكن من متابعته أو سحبه هنا قبل أن يجيب عليه.
                </p>
                <ButtonLink href="/explore" size="sm" variant="primary">
                  استكشاف المدرّسين
                </ButtonLink>
              </div>
            </Card>
          ) : (
            outgoingRequests.map((req) => (
              <Card key={req.id} className="overflow-hidden border-line">
                <CardContent className="p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink font-bold text-base">
                        {req.teacher.displayName.slice(0, 1)}
                      </span>
                      <div>
                        <h4 className="font-bold text-fg text-base">{req.teacher.displayName}</h4>
                        <span className="text-xs text-muted">المهارة: {req.skill.nameAr}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge tone="amber" className="text-xs">
                        بانتظار موافقة المدرّس
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleWithdraw(req.id)}
                        className="text-xs text-danger hover:bg-danger/10"
                      >
                        إلغاء الطلب
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-raised/50 p-3.5 border border-line text-xs flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted font-mono">
                      {formatDateTime(new Date(req.startAt), userTimezone, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className="text-subtle">
                      المدة: <strong className="text-fg font-mono">{req.durationMinutes} دقيقة</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Upcoming Accepted Sessions */}
      {activeTab === "upcoming" && (
        <div className="space-y-4">
          {upcomingSessions.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-line">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-raised text-muted">
                  <Calendar className="size-6" />
                </div>
                <h3 className="font-bold text-fg text-base">لا توجد جلسات قادمة مؤكدة</h3>
                <p className="text-xs text-muted max-w-sm mb-2">
                  عند قبول الجلسات، ستظهر هنا مع روابط الغرفة ومواعيدها للانضمام المباشر.
                </p>
                <ButtonLink href="/explore" size="sm" variant="primary">
                  حجز جلسة جديدة
                </ButtonLink>
              </div>
            </Card>
          ) : (
            upcomingSessions.map((session) => {
              const isTeacher = session.teacher.id === currentUserId;
              const partner = isTeacher ? session.learner : session.teacher;

              return (
                <Card key={session.id} className="overflow-hidden border-success/30 bg-success/5">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success font-bold text-base">
                          {partner.displayName.slice(0, 1)}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-fg text-base">{partner.displayName}</h4>
                            <Badge tone="success">مقبولة ومؤكدة</Badge>
                            <span className="text-xs text-muted">
                              ({isTeacher ? "أنت المدرّس" : "أنت المتعلم"})
                            </span>
                          </div>
                          <span className="text-xs text-muted block mt-0.5">
                            المهارة: {session.skill.nameAr}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {session.meetingUrl && (
                          <a
                            href={session.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3.5 py-1.5 text-xs font-bold text-canvas transition-colors hover:brightness-110"
                          >
                            <Video className="size-3.5" />
                            <span>رابط المكالمة</span>
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                        <ButtonLink
                          href={`/sessions/${session.id}`}
                          variant="outline"
                          size="sm"
                        >
                          دخول الغرفة
                        </ButtonLink>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            setShowCancelFormId(
                              showCancelFormId === session.id ? null : session.id,
                            )
                          }
                          className="text-xs text-danger hover:bg-danger/10"
                        >
                          إلغاء الجلسة
                        </Button>
                      </div>
                    </div>

                    {/* FR-4.6 Cancel Confirmation Form */}
                    {showCancelFormId === session.id && (
                      <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
                        {(() => {
                          const isLate =
                            new Date(session.startAt).getTime() - Date.now() <
                            12 * 60 * 60 * 1000;
                          return (
                            <>
                              <div className="flex items-start gap-2.5 text-xs">
                                <AlertCircle className="size-4 text-danger shrink-0 mt-0.5" />
                                <div>
                                  <strong className="text-fg block mb-1">
                                    {isLate
                                      ? "تحذير: إلغاء متأخر (أقل من 12 ساعة على الموعد)"
                                      : "إلغاء الجلسة (قبل الموعد بأكثر من 12 ساعة)"}
                                  </strong>
                                  <p className="text-muted leading-relaxed">
                                    {isLate
                                      ? isTeacher
                                        ? "وفق سياسة المنصة: إلغاء المدرّس المتأخر يُعد غياباً، وسيتم استرجاع الرصيد بالكامل إلى محفظة المتعلم."
                                        : `وفق سياسة المنصة: إلغاء المتعلم المتأخر يُعد غياباً، وسيتم تحويل الساعات المحجوزة (${session.durationMinutes} دقيقة) إلى المدرّس كتعويض عن حجز وقته.`
                                      : `وفق سياسة المنصة: بما أن الإلغاء يتم قبل أكثر من 12 ساعة، سيتم استرجاع الرصيد بالكامل (${session.durationMinutes} دقيقة) إلى محفظة المتعلم دون أي خصم.`}
                                  </p>
                                </div>
                              </div>

                              <textarea
                                rows={2}
                                placeholder="سبب الإلغاء (اختياري)..."
                                value={cancelReasonInputs[session.id] || ""}
                                onChange={(e) =>
                                  setCancelReasonInputs({
                                    ...cancelReasonInputs,
                                    [session.id]: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg placeholder:font-sans focus:border-danger focus:outline-none"
                              />

                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowCancelFormId(null)}
                                >
                                  تراجع
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => handleCancelAccepted(session.id)}
                                >
                                  تأكيد إلغاء الجلسة
                                </Button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div className="rounded-xl bg-canvas p-3.5 border border-line text-xs flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-fg font-medium">
                        <Calendar className="size-4 text-success" />
                        <span>
                          {formatDateTime(new Date(session.startAt), userTimezone, {
                            dateStyle: "full",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <span className="font-mono text-muted">
                        المدة: {session.durationMinutes} دقيقة
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Tab 4: Past Sessions */}
      {activeTab === "past" && (
        <div className="space-y-3">
          {pastSessions.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-line">
              <p className="text-xs text-muted">لا يوجد سجل لجلسات سابقة حتى الآن.</p>
            </Card>
          ) : (
            pastSessions.map((session) => {
              const isTeacher = session.teacher.id === currentUserId;
              const partner = isTeacher ? session.learner : session.teacher;

              return (
                <Card key={session.id} className="p-4 border-line">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised text-fg font-bold">
                        {partner.displayName.slice(0, 1)}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-fg text-sm">{partner.displayName}</strong>
                          <span className="text-muted">({session.skill.nameAr})</span>
                        </div>
                        <span className="text-subtle font-mono">
                          {formatDateTime(new Date(session.startAt), userTimezone, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-subtle">{session.durationMinutes} دقيقة</span>
                      <Badge
                        tone={
                          session.status === "RELEASED" || session.status === "BARTER_SETTLED"
                            ? "success"
                            : session.status === "REJECTED" || session.status === "AUTO_REJECTED"
                            ? "danger"
                            : "neutral"
                        }
                      >
                        {session.status === "RELEASED" || session.status === "BARTER_SETTLED"
                          ? "مكتملة ومحررة"
                          : session.status === "REJECTED"
                          ? "مرفوضة"
                          : session.status === "AUTO_REJECTED"
                          ? "رفض تلقائي"
                          : session.status === "CANCELLED"
                          ? "ملغاة"
                          : session.status}
                      </Badge>
                      <ButtonLink
                        href={`/sessions/${session.id}`}
                        variant="ghost"
                        size="sm"
                      >
                        التفاصيل
                      </ButtonLink>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
