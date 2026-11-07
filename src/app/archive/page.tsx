import { BookOpenCheck, ChevronDown, Code2, Dumbbell, ExternalLink, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionStatusBadge } from "@/components/ui/session-status-badge";
import { TimeAmount } from "@/components/ui/time-amount";
import { formatDateTime } from "@/lib/time";
import { getCurrentUser } from "@/server/auth/session";
import { getLearningArchive, type ArchiveEntry } from "@/server/services/sessions/archive-service";

export const metadata = {
  title: "أرشيف التعلّم",
  description: "ملاحظات جلساتك وأكوادها وملخصاتها الذكية كمرجع دراسي دائم",
};

export const instant = false;

// FR-5.5 / FR-8.2: the learner's permanent archive of finished sessions.
export default async function ArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin"); // Q-26

  const entries = await getLearningArchive(user.id);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-fg">
            <BookOpenCheck className="size-6 text-cyan-ink" />
            <span>أرشيف التعلّم</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            كل جلسة تعلّمتها تبقى هنا: ملاحظاتها وأكوادها، والملخص الذكي مع التمارين المقترحة، ونتيجة اختبارك.
          </p>
        </div>
        {entries.length > 0 && (
          <span className="text-sm text-muted">
            <bdi className="cs-num">{entries.length}</bdi> {entries.length === 1 ? "جلسة" : "جلسات"}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck />}
          title="أرشيفك فارغ حتى الآن"
          description="بعد انتهاء أول جلسة تتعلّم فيها، ستجد هنا ملاحظاتها وأكوادها وملخصها."
          action={
            <ButtonLink href="/explore" variant="outline" size="sm">
              ابحث عن مدرّس
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <ArchiveCard key={entry.sessionId} entry={entry} timezone={user.timezone} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchiveCard({ entry, timezone }: { entry: ArchiveEntry; timezone: string }) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-fg">{entry.skillNameAr}</h2>
              {entry.kind === "BARTER" && <Badge tone="cyan">مقايضة</Badge>}
              <SessionStatusBadge status={entry.status} />
            </div>
            <p className="text-sm text-muted">
              مع {entry.teacherName} · {formatDateTime(entry.startAt, timezone)} ·{" "}
              <TimeAmount minutes={entry.durationMinutes} size="sm" tone="muted" />
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entry.summary ? (
              <Badge tone="amber">
                <Sparkles className="size-3" />
                ملخص ذكي
              </Badge>
            ) : (
              <Badge tone="neutral">بدون ملخص</Badge>
            )}
            {entry.quiz && (
              <Badge tone="success">
                الاختبار: <bdi className="cs-num">{entry.quiz.correctCount}/{entry.quiz.totalCount}</bdi>
              </Badge>
            )}
            <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
          </div>
        </summary>

        <div className="space-y-5 border-t border-line p-5">
          <Section icon={<ListChecks />} title="هدف الجلسة">
            <p className="text-sm text-fg">{entry.goal}</p>
            {entry.ticked.total > 0 && (
              <p className="text-xs text-muted">
                المحاور المنجزة: <bdi className="cs-num">{entry.ticked.done}/{entry.ticked.total}</bdi>
              </p>
            )}
          </Section>

          {entry.summary ? (
            <>
              <Section icon={<Sparkles />} title="الملخص">
                <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{entry.summary.text}</p>
                {entry.summary.keyPoints.length > 0 && (
                  <ul className="list-disc space-y-1 ps-5 text-sm text-fg">
                    {entry.summary.keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </Section>
              {entry.summary.exercises.length > 0 && (
                <Section icon={<Dumbbell />} title="تمارين مقترحة">
                  <ol className="list-decimal space-y-2 ps-5 text-sm">
                    {entry.summary.exercises.map((ex, i) => (
                      <li key={i}>
                        <span className="font-semibold text-fg">{ex.title}</span>
                        <p className="text-muted">{ex.description}</p>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-line bg-raised p-3 text-xs text-muted">
              لم يتوفر ملخص ذكي لهذه الجلسة، فحُفظت ملاحظاتها وأكوادها الأصلية فقط.
            </p>
          )}

          <Section icon={<NotebookPen />} title="الملاحظات">
            {entry.notes.trim() ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{entry.notes}</p>
            ) : (
              <p className="text-sm text-subtle">لا توجد ملاحظات.</p>
            )}
          </Section>

          <Section icon={<Code2 />} title="الكود">
            {entry.code.trim() ? (
              <pre
                dir="ltr"
                className="max-h-96 overflow-auto rounded-lg border border-line bg-canvas p-4 text-start font-mono text-xs leading-relaxed text-fg"
              >
                <code data-language={entry.codeLanguage}>{entry.code}</code>
              </pre>
            ) : (
              <p className="text-sm text-subtle">لا يوجد كود.</p>
            )}
          </Section>

          <Link
            href={`/sessions/${entry.sessionId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-ink hover:underline"
          >
            <ExternalLink className="size-4" />
            فتح غرفة الجلسة
          </Link>
        </div>
      </details>
    </Card>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted [&_svg]:size-4">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
