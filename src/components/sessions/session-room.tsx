"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPLETION_THRESHOLD_PERCENT } from "@/lib/rules";
import {
  generateSummaryAndQuizAction,
  submitQuizAction,
  toggleAgendaTaskAction,
} from "@/server/actions/agenda";
import { reportProblemAction } from "@/server/actions/dispute";
import { rateTeacherAction } from "@/server/actions/rating";
import {
  completeSessionAction,
  expireSessionAction,
  processSessionReleaseAction,
  saveWorkspaceAction,
  updateMeetingUrlAction,
} from "@/server/actions/room";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Flag,
  HelpCircle,
  Lightbulb,
  Save,
  Sparkles,
  Square,
  Star,
  Video,
  XCircle,
} from "lucide-react";
import type { getSessionRoomData } from "@/server/services/sessions/room-service";

export type SessionRoomData = Awaited<ReturnType<typeof getSessionRoomData>>;

interface SessionRoomProps {
  initialData: SessionRoomData;
  currentUserId: string;
}

export function SessionRoom({ initialData, currentUserId }: SessionRoomProps) {
  const router = useRouter();
  const [session, setSession] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  // Active workspace tab: "notes" | "code" | "summary" | "quiz"
  const [activeTab, setActiveTab] = useState<"notes" | "code" | "summary" | "quiz">(() => {
    if (initialData.quiz && !initialData.quiz.attempt) return "quiz";
    if (initialData.aiSummary?.status === "SUCCEEDED") return "summary";
    return "notes";
  });
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Quiz state (FR-8.3)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(Boolean(session.quiz?.attempt));
  const [quizResult, setQuizResult] = useState<{
    correctCount: number;
    totalCount: number;
    percentage: number;
  } | null>(
    session.quiz?.attempt
      ? {
          correctCount: session.quiz.attempt.correctCount,
          totalCount: session.quiz.attempt.totalCount,
          percentage: Math.round(
            (session.quiz.attempt.correctCount / session.quiz.attempt.totalCount) * 100,
          ),
        }
      : null,
  );

  // Meeting URL editing state
  const [meetingUrlInput, setMeetingUrlInput] = useState(session.meetingUrl || "");
  const [isEditingMeetingUrl, setIsEditingMeetingUrl] = useState(!session.meetingUrl);
  const [meetingUrlSaved, setMeetingUrlSaved] = useState(false);

  // Workspace state
  const [notes, setNotes] = useState(session.workspace?.notes || "");
  const [code, setCode] = useState(session.workspace?.code || "");
  const [codeLanguage, setCodeLanguage] = useState(session.workspace?.codeLanguage || "javascript");
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // General error banner
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isTeacher = session.teacher.id === currentUserId;
  const partner = isTeacher ? session.learner : session.teacher;
  const isEnded = session.status !== "ACCEPTED" && session.status !== "IN_PROGRESS";
  // Q-8 / Q-13 / FR-6.1: ticking and completing are only possible while the session runs.
  const isRunning = session.status === "IN_PROGRESS";

  // ─────────────────────────────────────────────────────────────
  // Countdown Timer
  // ─────────────────────────────────────────────────────────────
  const [timeLeftMs, setTimeLeftMs] = useState<number>(() => {
    if (isEnded) return 0;
    const endAtMs = new Date(session.endAt).getTime();
    return Math.max(0, endAtMs - Date.now());
  });

  // Rating state (FR-6.2)
  const [ratingStars, setRatingStars] = useState(session.rating?.stars || 5);
  const [ratingReview, setRatingReview] = useState(session.rating?.review || "");
  const [ratingSuccess, setRatingSuccess] = useState(false);

  // Dispute state (FR-6.4)
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSuccess, setDisputeSuccess] = useState(false);

  useEffect(() => {
    if (isEnded) return;
    const interval = setInterval(() => {
      const endAtMs = new Date(session.endAt).getTime();
      const diff = endAtMs - Date.now();
      if (diff <= 0) {
        setTimeLeftMs(0);
        clearInterval(interval);
        if (session.status === "IN_PROGRESS") {
          startTransition(async () => {
            await expireSessionAction({ sessionId: session.id });
            router.refresh();
          });
        }
      } else {
        setTimeLeftMs(diff);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session.endAt, session.id, session.status, isEnded, router]);

  // FR-8.4 / FR-8.5: Automatically process release if 48h window elapsed without disputes
  useEffect(() => {
    if (
      (session.status === "ENDED" || session.status === "QUIZ_PENDING") &&
      session.releaseDueAt &&
      new Date(session.releaseDueAt).getTime() <= Date.now() &&
      !session.dispute
    ) {
      startTransition(async () => {
        const res = await processSessionReleaseAction({ sessionId: session.id });
        if (res.ok) {
          const outcome = res.data.status;
          if (outcome === "RELEASED" || outcome === "BARTER_COMPLETED") {
            setSession((prev) => ({ ...prev, status: outcome }));
            router.refresh();
          }
        }
      });
    }
  }, [session.status, session.releaseDueAt, session.dispute, session.id, router]);

  const handleRateTeacher = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await rateTeacherAction({
        sessionId: session.id,
        stars: ratingStars,
        review: ratingReview.trim() || undefined,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setRatingSuccess(true);
      router.refresh();
    });
  };

  const handleOpenDispute = () => {
    if (!disputeReason.trim() || disputeReason.trim().length < 5) {
      setErrorMessage("يجب كتابة سبب واضح للاعتراض (5 أحرف على الأقل)");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await reportProblemAction({
        sessionId: session.id,
        reason: disputeReason.trim(),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setDisputeSuccess(true);
      setShowDisputeForm(false);
      router.refresh();
    });
  };

  const handleGenerateSummary = () => {
    setErrorMessage(null);
    setIsGeneratingAi(true);
    startTransition(async () => {
      const res = await generateSummaryAndQuizAction({ sessionId: session.id });
      setIsGeneratingAi(false);
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Quiz Submission (FR-8.3)
  // ─────────────────────────────────────────────────────────────
  const handleSubmitQuiz = () => {
    if (!session.quiz) return;
    const questions = session.quiz.questions;
    if (Object.keys(selectedAnswers).length < questions.length) {
      setErrorMessage("يرجى الإجابة عن جميع أسئلة الاختبار قبل التسليم");
      return;
    }

    const orderedAnswers = questions.map((q) => selectedAnswers[q.position]);
    setErrorMessage(null);

    startTransition(async () => {
      const res = await submitQuizAction({
        sessionId: session.id,
        answers: orderedAnswers,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setQuizSubmitted(true);
      setQuizResult({
        correctCount: res.data.correctCount,
        totalCount: res.data.totalCount,
        percentage: res.data.percentage,
      });

      setSession((prev) => ({
        ...prev,
        status: res.data.status,
        quiz: prev.quiz
          ? {
              ...prev.quiz,
              attempt: {
                id: res.data.attemptId,
                quizId: prev.quiz.id,
                learnerId: currentUserId,
                answers: orderedAnswers,
                correctCount: res.data.correctCount,
                totalCount: res.data.totalCount,
                submittedAt: new Date(),
              },
            }
          : null,
      }));

      router.refresh();
    });
  };

  const formatTimer = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // ─────────────────────────────────────────────────────────────
  // Meeting URL update (FR-5.2)
  // ─────────────────────────────────────────────────────────────
  const handleSaveMeetingUrl = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await updateMeetingUrlAction({
        sessionId: session.id,
        meetingUrl: meetingUrlInput,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setIsEditingMeetingUrl(false);
      setMeetingUrlSaved(true);
      setTimeout(() => setMeetingUrlSaved(false), 3000);
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Workspace saving (FR-5.3)
  // ─────────────────────────────────────────────────────────────
  const handleSaveWorkspace = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await saveWorkspaceAction({
        sessionId: session.id,
        notes,
        code,
        codeLanguage,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setWorkspaceSaved(true);
      setTimeout(() => setWorkspaceSaved(false), 3000);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ─────────────────────────────────────────────────────────────
  // Toggle Agenda Task (FR-5.4)
  // ─────────────────────────────────────────────────────────────
  const handleToggleTask = (taskId: string) => {
    if (!isRunning) return;
    setErrorMessage(null);

    // Optimistic UI update
    setSession((prev) => {
      const updatedTasks = prev.agendaTasks.map((t) =>
        t.id === taskId ? { ...t, isDone: !t.isDone } : t,
      );
      const doneCount = updatedTasks.filter((t) => t.isDone).length;
      const completionPercent = Math.round((doneCount / updatedTasks.length) * 100);
      return {
        ...prev,
        agendaTasks: updatedTasks,
        completionPercent,
      };
    });

    startTransition(async () => {
      const res = await toggleAgendaTaskAction({ taskId });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        router.refresh();
      }
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Complete Session (FR-6.1 / FR-4.5)
  // ─────────────────────────────────────────────────────────────
  const handleCompleteSession = () => {
    if (
      !confirm(
        "هل أنت متأكد من إتمام الجلسة؟ سيتم احتساب كامل الساعات المحجوزة للمدرّس بعد حل الاختبار أو انقضاء 48 ساعة.",
      )
    ) {
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await completeSessionAction({ sessionId: session.id });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      router.refresh();
    });
  };

  const completionPercent = session.completionPercent ?? 0;
  const canComplete = completionPercent >= COMPLETION_THRESHOLD_PERCENT;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Navigation & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/sessions"
            className="flex size-9 items-center justify-center rounded-xl border border-line bg-canvas text-muted hover:text-fg hover:border-line-strong transition-colors"
            title="العودة لقائمة الجلسات"
          >
            <ArrowRight className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-fg">غرفة الجلسة التفاعلية</h1>
              {session.status === "IN_PROGRESS" && (
                <Badge tone="success" className="animate-pulse">
                  جلسة نشطة ومباشرة
                </Badge>
              )}
              {session.status === "ACCEPTED" && (
                <Badge tone="cyan">مقبولة ومؤكدة</Badge>
              )}
              {session.status === "QUIZ_PENDING" && (
                <Badge tone="amber" className="animate-pulse">
                  بانتظار الاختبار التقييمي
                </Badge>
              )}
              {session.status === "RELEASED" && (
                <Badge tone="success">
                  مكتملة ومُحررة الساعات
                </Badge>
              )}
              {session.status === "BARTER_COMPLETED" && (
                <Badge tone="success">
                  مكتملة الحصة المقايضية
                </Badge>
              )}
              {session.status === "DISPUTED" && (
                <Badge tone="danger">قيد النزاع والاعتراض</Badge>
              )}
              {isEnded &&
                session.status !== "DISPUTED" &&
                session.status !== "QUIZ_PENDING" &&
                session.status !== "RELEASED" &&
                session.status !== "BARTER_COMPLETED" && (
                  <Badge tone="neutral">أرشيف التعلم الدائم (مكتملة)</Badge>
                )}
            </div>
            <p className="text-xs text-muted flex items-center gap-2 mt-0.5">
              <span>
                المهارة: <strong className="text-fg">{session.skill.nameAr}</strong>
              </span>
              <span>•</span>
              <span>
                الطرف الآخر: <strong className="text-fg">{partner.displayName}</strong> ({isTeacher ? "أنت المدرّس" : "أنت المتعلم"})
              </span>
            </p>
          </div>
        </div>

        {/* Status / Timer Pill */}
        <div className="flex items-center gap-3">
          {!isEnded ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-2 text-success">
              <Clock className="size-4 animate-spin" style={{ animationDuration: "8s" }} />
              <div className="text-xs">
                <span className="text-[0.65rem] text-success/80 block">الوقت المتبقي للجلسة</span>
                <span className="font-mono font-bold text-sm tracking-wider">
                  {formatTimer(timeLeftMs)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2 text-xs text-muted">
              <CheckCircle2 className="size-4 text-success" />
              <span>الجلسة مكتملة ومحفوظة في سجل الأرشيف الدائم</span>
            </div>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* FR-8.3: Quiz Pending Alert Banner for Learner */}
      {session.status === "QUIZ_PENDING" && !isTeacher && !session.quiz?.attempt && !quizSubmitted && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber/40 bg-amber/10 p-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber/20 text-amber shrink-0">
              <Award className="size-5" />
            </div>
            <div>
              <strong className="text-fg block font-bold">
                الاختبار التقييمي متاح الآن لقياس الاستيعاب (FR-8.3)
              </strong>
              <span className="text-muted text-[0.75rem]">
                يُرجى الإجابة عن الأسئلة الثلاثة لتوثيق دليل التعلّم وتأكيد تحرير رصيد الجلسة للمدرّس (مهلة 48 ساعة).
              </span>
            </div>
          </div>
          {activeTab !== "quiz" && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setActiveTab("quiz")}
              className="text-xs shrink-0"
              icon={<Award className="size-3.5" />}
            >
              <span>حل الاختبار الآن</span>
            </Button>
          )}
        </div>
      )}

      {/* FR-5.2 Meeting Link Callout Bar */}
      <div className="rounded-2xl border border-cyan/20 bg-gradient-to-r from-cyan/5 via-canvas to-cyan/5 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink shrink-0">
            <Video className="size-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-fg">رابط الاتصال المرئي المباشر</h4>
            <p className="text-xs text-muted">
              {session.meetingUrl
                ? "انقر على الزر للانضمام إلى مكالمة الفيديو الخارجية (Google Meet / Zoom)"
                : "لم يتم تحديد رابط مكالمة بعد، يمكنك إضافة الرابط الآن ليدخل منه الطرفان"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {session.meetingUrl && !isEditingMeetingUrl ? (
            <>
              <a
                href={session.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-xs font-bold text-canvas shadow-sm hover:brightness-110 transition-colors"
              >
                <Video className="size-4" />
                <span>انضمام للمكالمة المرئية</span>
                <ExternalLink className="size-3" />
              </a>
              {!isEnded && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingMeetingUrl(true)}
                  className="text-xs"
                >
                  تعديل الرابط
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="url"
                placeholder="https://meet.google.com/xyz-abc أو رابط Zoom"
                value={meetingUrlInput}
                onChange={(e) => setMeetingUrlInput(e.target.value)}
                className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-fg placeholder:text-muted focus:border-cyan focus:outline-none min-w-[240px]"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isPending}
                onClick={handleSaveMeetingUrl}
                className="text-xs"
              >
                {meetingUrlSaved ? "تم الحفظ" : "حفظ الرابط"}
              </Button>
              {session.meetingUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingMeetingUrl(false)}
                  className="text-xs"
                >
                  إلغاء
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Right Column: Collaborative Workspace (FR-5.3 & FR-5.5) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-line overflow-hidden">
            <CardHeader className="border-b border-line bg-raised/30 px-5 py-3">
              <div className="flex items-center justify-between">
                {/* Workspace Tabs */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("notes")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "notes"
                        ? "bg-canvas text-fg shadow-xs border border-line"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    <FileText className="size-3.5" />
                    <span>ملاحظات الشرح</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "code"
                        ? "bg-canvas text-fg shadow-xs border border-line"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    <Code2 className="size-3.5" />
                    <span>محرر الأكواد</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("summary")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "summary"
                        ? "bg-canvas text-amber shadow-xs border border-line"
                        : "text-muted hover:text-amber"
                    }`}
                  >
                    <Sparkles className="size-3.5 text-amber" />
                    <span>الملخص الذكي والتمارين</span>
                    {session.aiSummary?.status === "SUCCEEDED" && (
                      <span className="size-1.5 rounded-full bg-success" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("quiz")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "quiz"
                        ? "bg-canvas text-amber shadow-xs border border-line"
                        : "text-muted hover:text-amber"
                    }`}
                  >
                    <Award className="size-3.5 text-amber" />
                    <span>اختبار الفهم (FR-8.3)</span>
                    {session.quiz?.attempt || quizSubmitted ? (
                      <span className="size-1.5 rounded-full bg-success" />
                    ) : session.quiz ? (
                      <span className="size-1.5 rounded-full bg-amber animate-pulse" />
                    ) : null}
                  </button>
                </div>

                {/* Workspace Actions */}
                <div className="flex items-center gap-2">
                  {activeTab === "code" && (
                    <>
                      <select
                        value={codeLanguage}
                        disabled={isEnded}
                        onChange={(e) => setCodeLanguage(e.target.value)}
                        className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[0.7rem] text-fg focus:outline-none"
                      >
                        <option value="javascript">JavaScript</option>
                        <option value="typescript">TypeScript</option>
                        <option value="python">Python</option>
                        <option value="html">HTML</option>
                        <option value="css">CSS</option>
                        <option value="sql">SQL</option>
                        <option value="plaintext">Text</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 text-[0.7rem] text-muted hover:text-fg transition-colors p-1"
                        title="نسخ الكود"
                      >
                        {codeCopied ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        <span>{codeCopied ? "تم النسخ" : "نسخ"}</span>
                      </button>
                    </>
                  )}

                  {!isEnded && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={handleSaveWorkspace}
                      className="text-xs h-7 px-2.5"
                    >
                      <Save className="size-3 me-1" />
                      <span>{workspaceSaved ? "تم الحفظ" : "حفظ"}</span>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {activeTab === "notes" ? (
                <div className="relative">
                  <textarea
                    rows={18}
                    readOnly={isEnded}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="اكتب ملاحظات ونقاط الشرح التعليمية هنا لتُحفظ في أرشيف المتعلم..."
                    className="w-full resize-y bg-canvas p-4 text-xs font-sans text-fg placeholder:text-muted focus:outline-none min-h-[420px] leading-relaxed"
                  />
                  {isEnded && !notes && (
                    <div className="p-8 text-center text-xs text-muted">
                      لم يتم تسجيل ملاحظات نصية أثناء هذه الجلسة.
                    </div>
                  )}
                </div>
              ) : activeTab === "code" ? (
                <div className="relative bg-[#1e1e1e] text-[#d4d4d4]">
                  <textarea
                    rows={18}
                    readOnly={isEnded}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="// مساحة كتابة الكود البرمجي المشترك أثناء الجلسة..."
                    className="w-full resize-y bg-transparent p-4 font-mono text-xs text-[#9cdcfe] placeholder:text-[#6a9955] focus:outline-none min-h-[420px] leading-relaxed"
                    style={{ direction: "ltr", textAlign: "left" }}
                  />
                  {isEnded && !code && (
                    <div className="p-8 text-center text-xs text-muted">
                      لا توجد أكواد برمجية مسجلة لهذه الجلسة.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 space-y-5 min-h-[420px] bg-canvas">
                  {session.aiSummary?.status === "SUCCEEDED" ? (
                    <div className="space-y-5">
                      {/* Summary Section */}
                      <div className="p-4 rounded-xl border border-amber/30 bg-amber/5 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber">
                          <Sparkles className="size-4" />
                          <span>الملخص الذكي للجلسة التعليمية (FR-8.2)</span>
                        </div>
                        <p className="text-xs text-fg leading-relaxed whitespace-pre-wrap">
                          {session.aiSummary.summary}
                        </p>
                      </div>

                      {/* Key Points */}
                      {Array.isArray(session.aiSummary.keyPoints) &&
                        (session.aiSummary.keyPoints as string[]).length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold text-fg flex items-center gap-1.5">
                              <CheckCircle2 className="size-3.5 text-success" />
                              <span>النقاط والمفاهيم الجوهرية المستفادة</span>
                            </h5>
                            <div className="space-y-1.5">
                              {(session.aiSummary.keyPoints as string[]).map((point, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-xs p-2.5 rounded-lg border border-line bg-surface/50 text-fg"
                                >
                                  <span className="flex size-4 items-center justify-center rounded-full bg-success/10 text-success text-[0.6rem] font-bold shrink-0 mt-0.5">
                                    ✓
                                  </span>
                                  <span className="leading-relaxed">{point}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Exercises */}
                      {Array.isArray(session.aiSummary.exercises) &&
                        (
                          session.aiSummary.exercises as Array<{
                            title: string;
                            description: string;
                          }>
                        ).length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold text-fg flex items-center gap-1.5">
                              <Lightbulb className="size-3.5 text-amber" />
                              <span>تمارين وتطبيقات عملية مقترحة لترسيخ المهارة</span>
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {(
                                session.aiSummary.exercises as Array<{
                                  title: string;
                                  description: string;
                                }>
                              ).map((ex, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-xl border border-line bg-surface/50 space-y-1"
                                >
                                  <span className="font-bold text-xs text-fg block">
                                    {idx + 1}. {ex.title}
                                  </span>
                                  <p className="text-[0.7rem] text-muted leading-relaxed">
                                    {ex.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  ) : session.aiSummary?.status === "FAILED" ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-amber/10 text-amber mx-auto">
                        <AlertCircle className="size-5" />
                      </div>
                      <h4 className="text-xs font-bold text-fg">خطة البديل الآمن (FR-8.5)</h4>
                      <p className="text-[0.75rem] text-muted max-w-md mx-auto leading-relaxed">
                        تعذر توليد الملخص التلقائي عبر الذكاء الاصطناعي — تم حفظ ملاحظات وأكواد الجلسة الأصلية في أرشيفك الدائم، وسيتم تحرير الساعات للمدرّس تلقائياً بعد 48 ساعة وفق المتطلب FR-8.5.
                      </p>
                      {isEnded && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending || isGeneratingAi}
                          onClick={handleGenerateSummary}
                          className="text-xs"
                        >
                          <span>إعادة محاولة التوليد الذكي</span>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center space-y-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink mx-auto">
                        <Sparkles className="size-5" />
                      </div>
                      <h4 className="text-xs font-bold text-fg">الملخص الذكي والتمارين التوليدية</h4>
                      <p className="text-[0.75rem] text-muted max-w-md mx-auto leading-relaxed">
                        {isEnded
                          ? "يمكنك الآن استخراج الملخص الذكي لنقاط الشرح مع التمارين التطبيقية والاختبار التقييمي عبر Gemini API."
                          : "سيتم توليد الملخص الذكي والتمارين تلقائياً فور إتمام الجلسة بناءً على ما تم شرحه وكتابته."}
                      </p>
                      {isEnded && (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isPending || isGeneratingAi}
                          onClick={handleGenerateSummary}
                          className="text-xs"
                          icon={<Sparkles className="size-3.5" />}
                        >
                          <span>
                            {isGeneratingAi ? "جاري التوليد الذكي..." : "توليد الملخص والتمارين الآن"}
                          </span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "quiz" && (
                <div className="p-6 space-y-6">
                  {session.quiz ? (
                    <div className="space-y-6">
                      {/* Header / Instructions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
                        <div>
                          <h4 className="text-sm font-bold text-fg flex items-center gap-2">
                            <Award className="size-4 text-amber" />
                            <span>اختبار قياس الاستيعاب ودليل التعلّم (FR-8.3)</span>
                          </h4>
                          <p className="text-xs text-muted mt-1 leading-relaxed">
                            {session.quiz.attempt || quizSubmitted
                              ? "تم توثيق حل الاختبار كدليل تعلّم رسمي وتمت معالجة تحرير الرصيد للجلسة."
                              : isTeacher
                                ? "تم توليد هذا الاختبار التقييمي آلياً بواسطة الذكاء الاصطناعي بناءً على محتوى الجلسة بانتظار إجابة المتعلم."
                                : "أجب عن الأسئلة التالية لقياس فهمك للمهارة المشروحة وتأكيد تحرير رصيد الجلسة للمدرّس."}
                          </p>
                        </div>
                        {(session.quiz.attempt || quizResult) && (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-success/30 bg-success/10 text-success text-xs font-bold shrink-0">
                            <CheckCircle2 className="size-4" />
                            <span>
                              النتيجة: {quizResult ? quizResult.correctCount : session.quiz.attempt?.correctCount} من{" "}
                              {quizResult ? quizResult.totalCount : session.quiz.attempt?.totalCount} (
                              {quizResult
                                ? quizResult.percentage
                                : Math.round(
                                    ((session.quiz.attempt?.correctCount || 0) /
                                      (session.quiz.attempt?.totalCount || 1)) *
                                      100,
                                  )}
                              %)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Notice for Teacher if not submitted */}
                      {isTeacher && !session.quiz.attempt && !quizSubmitted && (
                        <div className="p-4 rounded-xl border border-amber/30 bg-amber/5 text-xs text-amber space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <Clock className="size-3.5" />
                            <span>بانتظار حل الاختبار من قبل المتعلم (FR-8.3 / FR-8.4)</span>
                          </div>
                          <p className="text-[0.75rem] text-muted leading-relaxed">
                            تُحرر الساعات فور حل المتعلم للاختبار، أو تلقائياً بعد انقضاء 48 ساعة من انتهاء الجلسة وفق المتطلب FR-8.4 ما لم يُقدَّم اعتراض.
                          </p>
                        </div>
                      )}

                      {/* Notice for Released status */}
                      {(session.status === "RELEASED" || (session.kind === "DIRECT" && (session.quiz.attempt || quizSubmitted))) && (
                        <div className="p-4 rounded-xl border border-success/30 bg-success/5 text-xs text-success space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5" />
                            <span>تم تحرير رصيد الساعات بنجاح</span>
                          </div>
                          <p className="text-[0.75rem] text-muted leading-relaxed">
                            تم تحرير {session.durationMinutes} دقيقة لصالح المدرّس ({session.teacher.displayName}) وسداد أي التزامات سابقة وفق قواعد النظام المالي (FR-2.3).
                          </p>
                        </div>
                      )}

                      {/* Questions list */}
                      <div className="space-y-5">
                        {session.quiz.questions.map((q, qIndex) => {
                          const hasAttempt = Boolean(session.quiz?.attempt || quizSubmitted);
                          const attemptAnswers = (session.quiz?.attempt?.answers as number[] | undefined);
                          const chosenOption = hasAttempt && Array.isArray(attemptAnswers)
                            ? attemptAnswers[qIndex]
                            : selectedAnswers[q.position];
                          const isQuestionCorrect = hasAttempt && chosenOption === q.correctOption;

                          return (
                            <div
                              key={q.id}
                              className={`p-4 rounded-xl border transition-all ${
                                hasAttempt
                                  ? isQuestionCorrect
                                    ? "border-success/30 bg-success/5"
                                    : "border-danger/30 bg-danger/5"
                                  : "border-line bg-canvas"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <span className="font-bold text-xs text-fg">
                                  السؤال {qIndex + 1}: {q.prompt}
                                </span>
                                {hasAttempt && (
                                  <span
                                    className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                      isQuestionCorrect
                                        ? "bg-success/20 text-success"
                                        : "bg-danger/20 text-danger"
                                    }`}
                                  >
                                    {isQuestionCorrect ? "إجابة صحيحة ✓" : "إجابة خاطئة ✗"}
                                  </span>
                                )}
                              </div>

                              {/* Options */}
                              <div className="space-y-2">
                                {(q.options as string[]).map((optionText, optIndex) => {
                                  const isSelected = chosenOption === optIndex;
                                  const isCorrect = hasAttempt && q.correctOption === optIndex;
                                  const isWrongChoice = hasAttempt && isSelected && !isCorrect;

                                  return (
                                    <div
                                      key={optIndex}
                                      onClick={() => {
                                        if (hasAttempt || isTeacher) return;
                                        setSelectedAnswers((prev) => ({
                                          ...prev,
                                          [q.position]: optIndex,
                                        }));
                                      }}
                                      className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-colors ${
                                        hasAttempt
                                          ? isCorrect
                                            ? "border-success bg-success/15 font-bold text-success"
                                            : isWrongChoice
                                              ? "border-danger bg-danger/15 text-danger font-medium"
                                              : "border-line bg-surface/40 text-muted opacity-70"
                                          : isSelected
                                            ? "border-amber bg-amber/10 text-amber font-bold cursor-pointer"
                                            : isTeacher
                                              ? "border-line bg-surface/30 text-fg cursor-default"
                                              : "border-line bg-surface/30 text-fg hover:border-line-strong cursor-pointer"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <span
                                          className={`flex size-5 items-center justify-center rounded-full text-[0.65rem] font-mono font-bold shrink-0 ${
                                            hasAttempt
                                              ? isCorrect
                                                ? "bg-success text-canvas"
                                                : isWrongChoice
                                                  ? "bg-danger text-canvas"
                                                  : "bg-raised text-muted"
                                              : isSelected
                                                ? "bg-amber text-canvas"
                                                : "bg-raised text-muted"
                                          }`}
                                        >
                                          {String.fromCharCode(65 + optIndex)}
                                        </span>
                                        <span>{optionText}</span>
                                      </div>
                                      {hasAttempt && (
                                        <div className="shrink-0 text-[0.7rem]">
                                          {isCorrect && (
                                            <span className="text-success font-bold flex items-center gap-1">
                                              <Check className="size-3.5" />
                                              <span>الإجابة النموذجية</span>
                                            </span>
                                          )}
                                          {isWrongChoice && (
                                            <span className="text-danger font-bold flex items-center gap-1">
                                              <XCircle className="size-3.5" />
                                              <span>إجابتك</span>
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Explanation */}
                              {hasAttempt && q.explanation && (
                                <div className="mt-3 p-3 rounded-lg bg-surface/60 border border-line text-[0.7rem] text-muted space-y-1">
                                  <span className="font-bold text-fg block">الشرح التوضيحي:</span>
                                  <p className="leading-relaxed">{q.explanation}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Submit Quiz Action for Learner */}
                      {!isTeacher && !session.quiz.attempt && !quizSubmitted && (
                        <div className="pt-4 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <p className="text-[0.7rem] text-muted">
                            {Object.keys(selectedAnswers).length < session.quiz.questions.length
                              ? `يرجى الإجابة عن كافة الأسئلة (${Object.keys(selectedAnswers).length} من ${session.quiz.questions.length} محددة)`
                              : "جميع الأسئلة مجابة. جاهز لتسليم الاختبار وتأكيد تحرير الرصيد."}
                          </p>
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            disabled={
                              isPending ||
                              Object.keys(selectedAnswers).length < session.quiz.questions.length
                            }
                            onClick={handleSubmitQuiz}
                            className="text-xs"
                            icon={<Award className="size-4" />}
                          >
                            <span>تسليم الإجابات وإنهاء الاختبار (FR-8.3)</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center space-y-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-amber/10 text-amber mx-auto">
                        <HelpCircle className="size-5" />
                      </div>
                      <h4 className="text-xs font-bold text-fg">الاختبار غير متوفر حالياً</h4>
                      <p className="text-[0.75rem] text-muted max-w-md mx-auto leading-relaxed">
                        {session.aiSummary?.status === "FAILED"
                          ? "تعذر توليد الاختبار التقييمي عبر الـ AI — سيتم اعتماد شرط مهام الأجندة وتحرير الساعات للمدرّس تلقائياً بعد 48 ساعة وفق خطة البديل الآمن (FR-8.5)."
                          : "سيتم توليد الاختبار التقييمي آلياً فور انتهاء الجلسة بعد تأشير المهام المنجزة."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Left Column: Agenda Checklist & Completion (FR-5.4 & FR-6.1) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-line">
            <CardHeader className="border-b border-line px-5 py-3.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
                  <BookOpen className="size-4 text-amber" />
                  <span>أجندة الجلسة الذكية</span>
                </CardTitle>
                <span className="font-mono text-xs font-bold text-fg">
                  {completionPercent}% منجز
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-raised rounded-full h-2 mt-2 overflow-hidden border border-line">
                <div
                  className={`h-full transition-all duration-300 ${
                    completionPercent >= COMPLETION_THRESHOLD_PERCENT
                      ? "bg-success"
                      : "bg-amber"
                  }`}
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {session.agendaTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted">
                  لا توجد مهام محددة للأجندة في هذه الجلسة.
                </div>
              ) : (
                session.agendaTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleToggleTask(task.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      task.isDone
                        ? "bg-success/5 border-success/30 text-fg"
                        : "bg-canvas border-line text-fg hover:border-line-strong"
                    } ${isRunning ? "" : "cursor-default"}`}
                  >
                    <button
                      type="button"
                      disabled={!isRunning}
                      aria-label={task.isDone ? `إلغاء تأشير: ${task.title}` : `تأشير: ${task.title}`}
                      className="mt-0.5 text-muted hover:text-fg transition-colors"
                    >
                      {task.isDone ? (
                        <CheckSquare className="size-4 text-success" />
                      ) : (
                        <Square className="size-4 text-muted" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            task.isDone ? "line-through text-muted" : "text-fg"
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className="font-mono text-[0.65rem] text-muted shrink-0">
                          {task.plannedMinutes} دقيقة
                        </span>
                      </div>
                      {task.details && (
                        <p className="text-[0.7rem] text-muted mt-0.5 leading-relaxed">
                          {task.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Q-8: before both join around the start time, explain instead of offering the button */}
              {session.status === "ACCEPTED" && (
                <p className="pt-3 border-t border-line text-[0.7rem] text-muted text-center leading-relaxed">
                  تبدأ الجلسة عندما يدخل الطرفان الغرفة بين 15 دقيقة قبل الموعد و15 دقيقة بعده، وعندها
                  يمكن تأشير المهام وإتمام الجلسة.
                </p>
              )}

              {/* FR-6.1 Completion Button */}
              {isRunning && (
                <div className="pt-3 border-t border-line space-y-2">
                  <Button
                    type="button"
                    variant={canComplete ? "primary" : "outline"}
                    size="md"
                    disabled={!canComplete || isPending}
                    onClick={handleCompleteSession}
                    className="w-full justify-center"
                    icon={<CheckCircle2 className="size-4" />}
                  >
                    <span>إتمام الجلسة وإنهاؤها</span>
                  </Button>
                  {!canComplete && (
                    <p className="text-[0.7rem] text-muted text-center leading-relaxed">
                      وفق المتطلب FR-6.1: يتطلب زر إتمام الجلسة إنجاز 50% على الأقل من مهام الأجندة
                      (الحالي: {completionPercent}%).
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Session Overview Card */}
          <Card className="border-line p-4 text-xs space-y-2.5 bg-raised/30">
            <h5 className="font-bold text-fg flex items-center gap-1.5">
              <Calendar className="size-3.5 text-muted" />
              <span>تفاصيل الحجز</span>
            </h5>
            <div className="grid grid-cols-2 gap-2 text-muted">
              <div>
                <span className="block text-[0.65rem] text-subtle">المدة الإجمالية</span>
                <strong className="text-fg font-mono">{session.durationMinutes} دقيقة</strong>
              </div>
              <div>
                <span className="block text-[0.65rem] text-subtle">نوع التبادل</span>
                <strong className="text-fg">
                  {session.kind === "DIRECT" ? "مباشر بالدقائق" : "مقايضة حلقية"}
                </strong>
              </div>
            </div>
            {session.goal && (
              <div>
                <span className="block text-[0.65rem] text-subtle mb-0.5">الهدف من الجلسة</span>
                <p className="text-fg bg-canvas p-2.5 rounded-lg border border-line text-[0.75rem] leading-relaxed">
                  {session.goal}
                </p>
              </div>
            )}
          </Card>

          {/* FR-6.2: Teacher Rating Card */}
          {session.rating ? (
            <Card className="border-line p-4 text-xs space-y-2 bg-raised/30">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-fg flex items-center gap-1.5">
                  <Star className="size-4 text-amber fill-amber" />
                  <span>تقييم المدرّس</span>
                </h5>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`size-3.5 ${
                        s <= session.rating!.stars ? "text-amber fill-amber" : "text-muted"
                      }`}
                    />
                  ))}
                </div>
              </div>
              {session.rating.review && (
                <p className="text-fg bg-canvas p-2.5 rounded-lg border border-line text-[0.75rem] leading-relaxed">
                  &ldquo;{session.rating.review}&rdquo;
                </p>
              )}
              <p className="text-[0.65rem] text-muted">تم تسجيل التقييم بنجاح.</p>
            </Card>
          ) : !isTeacher && isEnded && session.status !== "DISPUTED" ? (
            <Card className="border-amber/30 bg-amber/5 p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-fg flex items-center gap-1.5">
                  <Star className="size-4 text-amber fill-amber" />
                  <span>تقييم تجربة المدرّس (FR-6.2)</span>
                </h5>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingStars(star)}
                      className="p-0.5 cursor-pointer hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`size-4 ${
                          star <= ratingStars ? "text-amber fill-amber" : "text-muted"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={2}
                value={ratingReview}
                onChange={(e) => setRatingReview(e.target.value)}
                placeholder="اكتب ملاحظة أو رأيك في أداء وشرح المدرّس (اختياري)..."
                className="w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg placeholder:text-muted focus:border-amber focus:outline-none leading-relaxed"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isPending || ratingSuccess}
                onClick={handleRateTeacher}
                className="w-full justify-center text-xs"
              >
                {ratingSuccess ? "تم إرسال التقييم" : "إرسال تقييم المدرّس"}
              </Button>
            </Card>
          ) : null}

          {/* FR-6.4: Dispute / Problem Report Card */}
          {session.status === "DISPUTED" || disputeSuccess ? (
            <Card className="border-danger/30 bg-danger/5 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-danger font-bold">
                <AlertTriangle className="size-4 shrink-0" />
                <span>الجلسة قيد النزاع والاعتراض</span>
              </div>
              <p className="text-muted leading-relaxed">
                {session.dispute?.reason || disputeReason
                  ? `سبب الاعتراض: "${session.dispute?.reason || disputeReason}"`
                  : "تمت إحالة الجلسة للإدارة لمراجعة السجلات والأدلة والفصل فيها وفق المتطلب FR-7.2."}
              </p>
            </Card>
          ) : isEnded && (session.status === "ENDED" || session.status === "QUIZ_PENDING") && !session.dispute ? (
            <Card className="border-line p-4 text-xs space-y-3 bg-raised/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-fg">
                  <Flag className="size-3.5 text-muted" />
                  <span>هل واجهت مشكلة؟ (FR-6.4)</span>
                </div>
                {!showDisputeForm && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDisputeForm(true)}
                    className="text-[0.7rem] h-7 px-2"
                  >
                    إبلاغ عن مشكلة
                  </Button>
                )}
              </div>

              {showDisputeForm && (
                <div className="space-y-2 pt-2 border-t border-line">
                  <p className="text-[0.7rem] text-muted leading-relaxed">
                    يمكنك تقديم اعتراض خلال 48 ساعة من انتهاء الجلسة. ستقوم الإدارة بمراجعة سجل الحضور ومساحة العمل للفصل في النزاع.
                  </p>
                  <textarea
                    rows={3}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="اشرح المشكلة بوضوح (غياب غير مسجل، شرح غير لائق، انقطاع...)"
                    className="w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg placeholder:text-muted focus:border-danger focus:outline-none leading-relaxed"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDisputeForm(false)}
                      className="text-xs h-7 px-2.5"
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={isPending || disputeReason.trim().length < 5}
                      onClick={handleOpenDispute}
                      className="text-xs h-7 px-3"
                    >
                      تأكيد تقديم الاعتراض
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

