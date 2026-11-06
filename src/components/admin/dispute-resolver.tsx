"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import { resolveDisputeAction } from "@/server/actions/admin";
import type { getDisputeEvidence } from "@/server/services/admin/disputes-admin-service";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  FileText,
  Gavel,
  History,
  Scale,
  Square,
} from "lucide-react";

export type DisputeEvidenceData = Awaited<ReturnType<typeof getDisputeEvidence>>;

interface DisputeResolverProps {
  dispute: DisputeEvidenceData;
}

export function DisputeResolver({ dispute }: DisputeResolverProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedResolution, setSelectedResolution] = useState<"REFUND_LEARNER" | "PAY_TEACHER">(
    "REFUND_LEARNER",
  );
  const [adminNote, setAdminNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"notes" | "code">("notes");

  const session = dispute.session;
  const isResolved = dispute.status === "RESOLVED";

  const handleResolve = () => {
    const actionText =
      selectedResolution === "REFUND_LEARNER"
        ? "إعادة الساعات إلى المحفظة المتاحة للمتعلم"
        : "تحويل الساعات إلى المدرّس وسداد ديونه السابقة";

    if (!confirm(`هل أنت متأكد من تثبيت هذا القرار التحكيمي؟\n\nالقرار: ${actionText}`)) {
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await resolveDisputeAction({
        disputeId: dispute.id,
        resolution: selectedResolution,
        adminNote: adminNote.trim() || undefined,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      router.refresh();
    });
  };

  const tasksCount = session.agendaTasks.length;
  const doneTasksCount = session.agendaTasks.filter((t) => t.isDone).length;
  const completionPercent = tasksCount > 0 ? Math.round((doneTasksCount / tasksCount) * 100) : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/disputes"
            className="flex size-9 items-center justify-center rounded-xl border border-line bg-canvas text-muted hover:text-fg hover:border-line-strong transition-colors"
          >
            <ArrowRight className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-fg">ملف التحكيم وفض النزاع (FR-7.2)</h1>
              {isResolved ? (
                <Badge tone="neutral">نزاع مفصول فيه</Badge>
              ) : (
                <Badge tone="danger">قيد النظر والتحكيم</Badge>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              جلسة: <strong className="text-fg">{session.skill.nameAr}</strong> ({session.durationMinutes} دقيقة)
            </p>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Dispute Summary Card */}
      <Card className="border-line p-5 space-y-3 bg-raised/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-danger" />
            <h3 className="font-bold text-sm text-fg">بيانات الشكوى / سبب الإحالة</h3>
          </div>
          <span className="text-[0.65rem] text-muted">
            تاريخ الفتح: {formatDateTime(dispute.createdAt, "Asia/Damascus")}
          </span>
        </div>

        <p className="text-xs text-fg bg-canvas p-3 rounded-xl border border-line leading-relaxed">
          {dispute.reason || "إحالة تلقائية من النظام لعدم بلوغ الحد الأدنى لنسبة الإنجاز (50%)"}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
          <div className="p-3 rounded-xl border border-line bg-surface">
            <span className="block text-[0.65rem] text-muted mb-0.5">المتعلم (Learner)</span>
            <strong className="text-fg">{session.learner.displayName}</strong>
            <span className="block text-[0.7rem] text-muted">{session.learner.email}</span>
          </div>
          <div className="p-3 rounded-xl border border-line bg-surface">
            <span className="block text-[0.65rem] text-muted mb-0.5">المدرّس (Teacher)</span>
            <strong className="text-fg">{session.teacher.displayName}</strong>
            <span className="block text-[0.7rem] text-muted">{session.teacher.email}</span>
          </div>
        </div>
      </Card>

      {/* Evidence Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Agenda & Attendance & Audit (Evidence) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Agenda Checklist Evidence */}
          <Card className="border-line">
            <CardHeader className="border-b border-line px-5 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
                <BookOpen className="size-4 text-amber" />
                <span>أجندة الجلسة ونسبة الإنجاز (FR-5.4)</span>
              </CardTitle>
              <span className="font-mono text-xs font-bold text-fg">
                {completionPercent}% منجز ({doneTasksCount}/{tasksCount})
              </span>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5">
              {session.agendaTasks.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">لا توجد مهام أجندة محددة.</p>
              ) : (
                session.agendaTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs ${
                      task.isDone
                        ? "bg-success/5 border-success/30 text-fg"
                        : "bg-canvas border-line text-muted"
                    }`}
                  >
                    <span className="mt-0.5">
                      {task.isDone ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <Square className="size-4 text-muted" />
                      )}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${task.isDone ? "text-fg" : "text-muted"}`}>
                          {task.title}
                        </span>
                        <span className="font-mono text-[0.65rem] text-muted">
                          {task.plannedMinutes} دقيقة
                        </span>
                      </div>
                      {task.doneAt && (
                        <span className="text-[0.65rem] text-muted block mt-0.5">
                          تم التأشير في: {formatDateTime(task.doneAt, "Asia/Damascus")}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Workspace Notes & Code Evidence */}
          <Card className="border-line">
            <CardHeader className="border-b border-line px-5 py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("notes")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === "notes"
                      ? "bg-canvas text-fg shadow-xs border border-line"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  <FileText className="size-3.5" />
                  <span>ملاحظات الجلسة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("code")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === "code"
                      ? "bg-canvas text-fg shadow-xs border border-line"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  <Code2 className="size-3.5" />
                  <span>الكود البرمجي المشترك</span>
                </button>
              </div>
              <span className="text-[0.65rem] text-muted">
                تعديل: #{session.workspace?.revision ?? 0}
              </span>
            </CardHeader>
            <CardContent className="p-4">
              {activeTab === "notes" ? (
                <div className="bg-canvas p-3 rounded-xl border border-line min-h-[160px] text-xs leading-relaxed whitespace-pre-wrap font-sans text-fg">
                  {session.workspace?.notes || (
                    <span className="text-muted">لم يتم تدوين ملاحظات نصية أثناء الجلسة.</span>
                  )}
                </div>
              ) : (
                <div
                  className="bg-[#1e1e1e] p-3 rounded-xl border border-line min-h-[160px] text-xs font-mono text-[#9cdcfe] whitespace-pre-wrap leading-relaxed"
                  style={{ direction: "ltr", textAlign: "left" }}
                >
                  {session.workspace?.code || (
                    <span className="text-[#6a9955]">{"// لا توجد أكواد برمجية مسجلة."}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attendance Log (FR-5.1 Evidence) */}
          <Card className="border-line">
            <CardHeader className="border-b border-line px-5 py-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
                <Clock className="size-4 text-cyan-ink" />
                <span>سجل الحضور والدخول والخروج (Attendance Log)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {session.attendance.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">لم يُسجل دخول أي طرف.</p>
              ) : (
                <div className="space-y-2">
                  {session.attendance.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface border border-line text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${
                            log.event === "JOIN" ? "bg-success" : "bg-danger"
                          }`}
                        />
                        <strong className="text-fg">{log.user.displayName}</strong>
                        <span className="text-muted">
                          {log.event === "JOIN" ? "انضم إلى الغرفة" : "غادر الغرفة"}
                        </span>
                      </div>
                      <span className="font-mono text-[0.65rem] text-muted">
                        {formatDateTime(log.at, "Asia/Damascus")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Arbitration Action & Audit */}
        <div className="lg:col-span-5 space-y-6">
          {/* Arbitration Decision Panel (FR-7.2) */}
          <Card className="border-line overflow-hidden">
            <CardHeader className="border-b border-line px-5 py-3.5 bg-raised/30">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-fg">
                <Gavel className="size-4 text-amber" />
                <span>قرار التحكيم الإداري (FR-7.2)</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {isResolved ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl border border-line bg-surface space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">الحكم الصادر:</span>
                      <Badge tone={dispute.resolution === "REFUND_LEARNER" ? "cyan" : "success"}>
                        {dispute.resolution === "REFUND_LEARNER"
                          ? "إعادة الرصيد للمتعلم"
                          : "تحويل الرصيد للمدرّس"}
                      </Badge>
                    </div>
                    {dispute.adminNote && (
                      <p className="text-xs text-fg leading-relaxed bg-canvas p-2.5 rounded-lg border border-line">
                        <strong className="text-muted block text-[0.65rem] mb-0.5">مذكرة الإدارة:</strong>
                        {dispute.adminNote}
                      </p>
                    )}
                    <div className="text-[0.65rem] text-muted flex items-center justify-between pt-1">
                      <span>الفصل بواسطة: {dispute.resolvedBy?.displayName}</span>
                      <span>
                        {dispute.resolvedAt && formatDateTime(dispute.resolvedAt, "Asia/Damascus")}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted leading-relaxed">
                    حدد قرارك الإداري النهائي بعد مراجعة الأدلة وسجل الحضور ونسبة إنجاز الأجندة:
                  </p>

                  {/* Radio Choice */}
                  <div className="space-y-2">
                    <label
                      onClick={() => setSelectedResolution("REFUND_LEARNER")}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedResolution === "REFUND_LEARNER"
                          ? "border-cyan bg-cyan/5 text-fg"
                          : "border-line bg-canvas text-muted hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        checked={selectedResolution === "REFUND_LEARNER"}
                        onChange={() => setSelectedResolution("REFUND_LEARNER")}
                        className="mt-0.5"
                      />
                      <div>
                        <strong className="text-xs font-bold text-fg block">
                          إعادة الساعات للمتعلم (Refund Learner)
                        </strong>
                        <span className="text-[0.7rem] text-muted leading-relaxed">
                          إلغاء حجز الضمان وإرجاع كامل الـ {session.durationMinutes} دقيقة إلى الرصيد المتاح للمتعلم (FR-2.4).
                        </span>
                      </div>
                    </label>

                    <label
                      onClick={() => setSelectedResolution("PAY_TEACHER")}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedResolution === "PAY_TEACHER"
                          ? "border-success bg-success/5 text-fg"
                          : "border-line bg-canvas text-muted hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        checked={selectedResolution === "PAY_TEACHER"}
                        onChange={() => setSelectedResolution("PAY_TEACHER")}
                        className="mt-0.5"
                      />
                      <div>
                        <strong className="text-xs font-bold text-fg block">
                          تحويل الساعات للمدرّس (Pay Teacher)
                        </strong>
                        <span className="text-[0.7rem] text-muted leading-relaxed">
                          تحرير الـ {session.durationMinutes} دقيقة لصالح المدرّس، مع تسديد أي ديون سابقة عليه أولاً (FR-2.3).
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Note textarea */}
                  <div>
                    <label className="block text-[0.65rem] text-muted mb-1 font-semibold">
                      مذكرة قرار التحكيم وتبرير الحكم (اختياري)
                    </label>
                    <textarea
                      rows={3}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="بيان سبب القرار بناءً على سجل الحضور أو مراجعة الأجندة والملاحظات..."
                      className="w-full rounded-xl border border-line bg-canvas p-2.5 text-xs text-fg placeholder:text-muted focus:border-amber focus:outline-none leading-relaxed"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={isPending}
                    onClick={handleResolve}
                    className="w-full justify-center"
                    icon={<Gavel className="size-4" />}
                  >
                    <span>تأكيد وتنفيذ قرار التحكيم</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Session Events Audit Trail */}
          <Card className="border-line p-4 space-y-3">
            <h5 className="font-bold text-xs text-fg flex items-center gap-1.5">
              <History className="size-3.5 text-muted" />
              <span>سجل التحولات وحركات الحالة (Audit Trail)</span>
            </h5>
            <div className="space-y-2 text-xs">
              {session.events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-lg border border-line bg-surface/40 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.65rem] text-amber font-semibold">
                      {evt.trigger}
                    </span>
                    <span className="font-mono text-[0.6rem] text-muted">
                      {formatDateTime(evt.createdAt, "Asia/Damascus")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[0.7rem] text-muted">
                    <span>{evt.fromStatus || "START"}</span>
                    <span>&larr;</span>
                    <strong className="text-fg">{evt.toStatus}</strong>
                  </div>
                  {evt.note && <p className="text-[0.65rem] text-subtle">{evt.note}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
