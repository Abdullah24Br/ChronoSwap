import {
  ArrowLeftRight,
  BookOpenCheck,
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  Inbox,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionStatusBadge } from "@/components/ui/session-status-badge";
import { TimeAmount } from "@/components/ui/time-amount";
import { TimeGauge } from "@/components/wallet/time-gauge";
import { WalletSummary } from "@/components/wallet/wallet-summary";
import { formatDateTime } from "@/lib/time";
import type { AttentionItem, HomeSummary } from "@/server/services/dashboard/home-summary";

// The signed-in home page: balances, what needs doing, the next sessions, and what the user has
// done so far (FR-2.1, FR-4.2, FR-6.2, FR-8.3, FR-3.4, FR-5.5).

interface HomeDashboardProps {
  summary: HomeSummary;
  timezone: string;
}

const MAX_RATE_ITEMS = 3;

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

function Num({ value }: { value: number }) {
  return <bdi className="cs-num">{value}</bdi>;
}

function attentionRow(item: AttentionItem): { icon: LucideIcon; tone: string; text: React.ReactNode; href: string; action: string } {
  switch (item.kind) {
    case "debt":
      return {
        icon: TriangleAlert,
        tone: "text-danger",
        text: (
          <>
            عليك دين <TimeAmount minutes={item.minutes} size="sm" tone="danger" />، يُسدَّد من أول ساعات تكسبها
            بالتدريس.
          </>
        ),
        href: "/wallet",
        action: "عرض المحفظة",
      };
    case "incoming-requests":
      return {
        icon: Inbox,
        tone: "text-amber-ink",
        text: (
          <>
            <Num value={item.count} /> {item.count === 1 ? "طلب جلسة ينتظر" : "طلبات جلسات تنتظر"} ردّك قبل موعدها.
          </>
        ),
        href: "/sessions",
        action: "الرد على الطلبات",
      };
    case "quiz":
      return {
        icon: ClipboardCheck,
        tone: "text-cyan-ink",
        text: <>اختبار جلسة «{item.skillNameAr}» ينتظرك. حلّه لتُحرَّر ساعات المدرّس.</>,
        href: `/sessions/${item.sessionId}`,
        action: "حلّ الاختبار",
      };
    case "rate":
      return {
        icon: Star,
        tone: "text-amber-ink",
        text: (
          <>
            قيّم جلستك في «{item.skillNameAr}» مع {item.teacherName}.
          </>
        ),
        href: `/sessions/${item.sessionId}`,
        action: "تقييم الجلسة",
      };
    case "barter-respond":
      return {
        icon: ArrowLeftRight,
        tone: "text-cyan-ink",
        text: (
          <>
            <Num value={item.count} /> {item.count === 1 ? "اقتراح مقايضة ينتظر" : "اقتراحات مقايضة تنتظر"} موافقتك.
          </>
        ),
        href: "/barter",
        action: "عرض الاقتراحات",
      };
    case "barter-book":
      return {
        icon: CalendarPlus,
        tone: "text-amber-ink",
        text: (
          <>
            احجز جلستك في <Num value={item.count} /> {item.count === 1 ? "حلقة مقايضة نشطة" : "حلقات مقايضة نشطة"}.
          </>
        ),
        href: "/barter",
        action: "احجز الآن",
      };
  }
}

export function HomeDashboard({ summary, timezone }: HomeDashboardProps) {
  const { wallet, stats } = summary;

  // Keep the list short: at most a few "rate" reminders, everything else always shown.
  let rates = 0;
  const attention = summary.attention.filter((a) => a.kind !== "rate" || ++rates <= MAX_RATE_ITEMS);

  return (
    <div className="flex flex-col gap-12 pb-12">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl leading-tight md:text-6xl">أهلاً، {firstName(summary.displayName)}</h1>
          <p className="max-w-xl text-muted">
            {stats.taughtCount + stats.learnedCount === 0 ? (
              "حسابك جاهز. احجز جلستك الأولى، أو اعرض مهارة لتبدأ بكسب الساعات."
            ) : (
              <>
                علّمت <TimeAmount minutes={stats.taughtMinutes} size="sm" tone="amber" /> وتعلّمت{" "}
                <TimeAmount minutes={stats.learnedMinutes} size="sm" tone="cyan" /> حتى الآن.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/explore" icon={<CalendarPlus className="size-4" />}>
            احجز جلسة
          </ButtonLink>
          <ButtonLink href="/barter" variant="outline" icon={<ArrowLeftRight className="size-4" />}>
            المقايضة
          </ButtonLink>
        </div>
      </header>

      {/* Balances: the gauge (available vs frozen) next to the exact numbers. */}
      <section aria-label="رصيدك" className="grid items-center gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
        <div data-reveal className="mx-auto aspect-square w-full max-w-[15rem]">
          <TimeGauge availableMinutes={wallet.availableMinutes} frozenMinutes={wallet.frozenMinutes} />
        </div>
        <WalletSummary
          availableMinutes={wallet.availableMinutes}
          frozenMinutes={wallet.frozenMinutes}
          debtMinutes={wallet.debtMinutes}
        />
      </section>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section aria-labelledby="attention-title" className="space-y-4">
          <h2 id="attention-title" className="text-2xl md:text-3xl">
            ما ينتظرك
          </h2>
          {attention.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-strong px-5 py-8 text-center text-sm text-muted">
              لا شيء ينتظرك الآن.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {attention.map((item, i) => {
                const row = attentionRow(item);
                const Icon = row.icon;
                return (
                  <li key={i} data-reveal className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <Icon className={`size-5 shrink-0 ${row.tone}`} aria-hidden />
                    <p className="min-w-0 flex-1 text-sm leading-7 text-fg">{row.text}</p>
                    <Link href={row.href} className="text-sm font-medium text-cyan-ink underline-offset-4 hover:underline">
                      {row.action}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {summary.pendingOutgoingCount > 0 && (
            <p className="text-sm text-muted">
              <Num value={summary.pendingOutgoingCount} />{" "}
              {summary.pendingOutgoingCount === 1 ? "طلب أرسلته ينتظر" : "طلبات أرسلتها تنتظر"} رد المدرّس.
            </p>
          )}
        </section>

        <section aria-labelledby="next-title" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 id="next-title" className="text-2xl md:text-3xl">
              جلساتك القادمة
            </h2>
            <Link href="/sessions" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
              كل الجلسات
            </Link>
          </div>
          {summary.nextSessions.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title="لا جلسات مؤكدة بعد"
              description="ابحث عن مدرّس لما تريد تعلّمه، أو انتظر طلبات المتعلّمين على مهاراتك."
              action={
                <ButtonLink href="/explore" variant="outline" size="sm">
                  تصفّح المهارات
                </ButtonLink>
              }
            />
          ) : (
            <ol className="space-y-3">
              {summary.nextSessions.map((s) => (
                <li key={s.id}>
                  <Card interactive className="p-0">
                    <Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">{s.skillNameAr}</span>
                          <Badge tone={s.role === "teacher" ? "amber" : "cyan"}>
                            {s.role === "teacher" ? "تُعلّم" : "تتعلّم"}
                          </Badge>
                          {s.kind === "BARTER" && <Badge>مقايضة</Badge>}
                        </div>
                        <p className="text-sm text-muted">
                          {s.role === "teacher" ? "مع المتعلّم" : "مع المدرّس"} {s.partnerName}،{" "}
                          {formatDateTime(s.startAt, timezone)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <TimeAmount minutes={s.durationMinutes} size="sm" tone="muted" />
                        <SessionStatusBadge status={s.status} />
                      </div>
                    </Link>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section aria-labelledby="record-title" className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <h2 id="record-title" className="text-2xl md:text-3xl">
            حصيلتك
          </h2>
          <Link href="/archive" className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            <BookOpenCheck className="size-4" aria-hidden />
            أرشيف التعلّم
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4">
          <Stat label="ساعات علّمتها" note={<><Num value={stats.taughtCount} /> جلسة</>}>
            <TimeAmount minutes={stats.taughtMinutes} size="lg" tone="amber" />
          </Stat>
          <Stat label="ساعات تعلّمتها" note={<><Num value={stats.learnedCount} /> جلسة</>}>
            <TimeAmount minutes={stats.learnedMinutes} size="lg" tone="cyan" />
          </Stat>
          <Stat
            label="تقييمك كمدرّس"
            note={stats.rating ? <><Num value={stats.rating.count} /> تقييم</> : "لا تقييمات بعد"}
          >
            {stats.rating ? (
              <span className="inline-flex items-baseline gap-1.5 text-2xl text-fg">
                <bdi className="cs-num" data-count="">
                  {stats.rating.average}
                </bdi>
                <Star className="size-4 fill-amber text-amber" aria-label="من 5" />
              </span>
            ) : (
              <span className="text-2xl text-subtle">—</span>
            )}
          </Stat>
          <Stat label="مهارات تعرضها" note={<><Num value={stats.skillsWanted} /> تطلبها</>}>
            <span className="text-2xl text-fg">
              <bdi className="cs-num" data-count="">
                {stats.skillsOffered}
              </bdi>
            </span>
          </Stat>
        </dl>
      </section>
    </div>
  );
}

function Stat({ label, note, children }: { label: string; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 bg-surface p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>{children}</dd>
      <dd className="text-xs text-subtle">{note}</dd>
    </div>
  );
}
