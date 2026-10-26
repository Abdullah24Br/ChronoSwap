import { ArrowLeft, ArrowLeftRight, CalendarCheck, GraduationCap } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TimeAmount } from "@/components/ui/time-amount";
import { WalletSummary } from "@/components/wallet/wallet-summary";

const steps = [
  {
    icon: GraduationCap,
    title: "علّم ما تتقنه",
    body: "كل ساعة تدرّسها تُضاف إلى محفظتك كساعة متاحة.",
    tone: "text-amber-ink",
  },
  {
    icon: CalendarCheck,
    title: "تعلّم ما تريده",
    body: "احجز جلسة مع مدرّس، وتُجمَّد ساعاتك بأمان حتى تكتمل الجلسة.",
    tone: "text-cyan-ink",
  },
  {
    icon: ArrowLeftRight,
    title: "أو قايض مباشرة",
    body: "نجد لك حلقة تبادل ثلاثية: كل طرف يعطي بقدر ما يأخذ، دون رصيد مسبق.",
    tone: "text-fg",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 md:gap-24">
      <section className="grid items-center gap-10 pt-4 md:grid-cols-[1.35fr_1fr] md:pt-10">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-amber" />
            بنك الوقت للمهارات
          </span>
          <h1 className="text-4xl font-bold leading-[1.25] text-fg md:text-[2.75rem] md:leading-[1.3] lg:text-[3.15rem]">
            الوقت هو <span className="text-amber-ink">العملة</span>.
            <br />
            والمعرفة هي <span className="text-cyan-ink">المقابل</span>.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            علّم ساعة، وتعلّم ساعة. ChronoSwap منصة لتبادل المهارات تُحتسب فيها كل دقيقة بدقة، وتُحفظ ساعاتك في محفظة
            آمنة حتى يكتمل التعلّم فعلاً.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/register" size="lg">
              احصل على <TimeAmount minutes={120} size="md" className="text-on-amber" /> مجاناً
            </ButtonLink>
            <ButtonLink href="/design" variant="outline" size="lg" icon={<ArrowLeft className="size-4" />}>
              نظام التصميم
            </ButtonLink>
          </div>
        </div>
        <WalletSummary availableMinutes={150} frozenMinutes={90} debtMinutes={0} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">كيف تعمل المنصة؟</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body, tone }, i) => (
            <Card key={title} className="flex flex-col gap-3 p-6">
              <div className="flex items-center justify-between">
                <Icon className={`size-6 ${tone}`} />
                <span className="cs-num text-sm text-subtle">0{i + 1}</span>
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-muted">{body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
