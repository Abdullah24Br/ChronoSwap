import { ButtonLink } from "@/components/ui/button";
import { TimeAmount } from "@/components/ui/time-amount";
import { CycleCanvas } from "@/components/barter/cycle-canvas";
import { AstrolabeHero } from "./astrolabe-hero";
import { EscrowStory } from "./escrow-story";
import { WELCOME_BONUS_MINUTES } from "@/lib/rules";

/** The public home page for visitors who are not signed in. */
export function Landing() {
  return (
    <div className="flex flex-col gap-10 md:gap-16">
      <AstrolabeHero>
        <h1 data-hero-line className="text-5xl leading-[1.2] text-fg sm:text-6xl lg:text-7xl lg:leading-[1.15]">
          الوقت عملتك.
        </h1>
        <p data-hero-line className="max-w-[34rem] text-lg leading-8 text-muted">
          علّم ما تتقنه بالساعة، وتعلّم بها ما تريده من غيرك. كل دقيقة محسوبة، ومحفوظة في محفظة آمنة حتى يكتمل
          التعلّم.
        </p>
        <div data-hero-line className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/register" size="lg">
            أنشئ حسابك واحصل على <TimeAmount minutes={WELCOME_BONUS_MINUTES} size="md" className="text-on-amber" />
          </ButtonLink>
          <ButtonLink href="/explore" variant="outline" size="lg">
            تصفّح المهارات
          </ButtonLink>
        </div>
      </AstrolabeHero>

      <EscrowStory />

      <section aria-labelledby="cycle-title" className="grid items-center gap-10 py-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <h2 id="cycle-title" className="text-3xl leading-snug md:text-5xl md:leading-tight">
            بلا رصيد؟ قايض في حلقة
          </h2>
          <p className="max-w-[34rem] leading-8 text-muted">
            إذا كانت سارة تعلّم عمر، وعمر يعلّم ليلى، وليلى تعلّم سارة، فكل واحد منهم يعطي بقدر ما يأخذ. نبحث لك
            عن هذه الحلقات تلقائياً، وتبدأ حين يوافق الثلاثة على مدة واحدة.
          </p>
          <ButtonLink href="/barter" variant="outline">
            ابحث عن حلقتك
          </ButtonLink>
        </div>
        <div className="rounded-[1.75rem] border border-line bg-surface/60 p-6 md:p-10">
          <CycleCanvas names={["سارة", "عمر", "ليلى"]} />
        </div>
      </section>

      <section className="flex flex-col items-start gap-5 border-t border-line py-14 md:items-center md:text-center">
        <h2 className="text-3xl leading-snug md:text-4xl">ساعتك الأولى علينا</h2>
        <p className="max-w-[34rem] text-muted">
          كل حساب جديد يبدأ بـ <TimeAmount minutes={WELCOME_BONUS_MINUTES} size="sm" tone="amber" /> لتحجز بها جلستك
          الأولى اليوم.
        </p>
        <ButtonLink href="/register" size="lg">
          أنشئ حسابك
        </ButtonLink>
      </section>
    </div>
  );
}
