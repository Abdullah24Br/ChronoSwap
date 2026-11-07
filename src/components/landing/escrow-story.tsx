"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check } from "lucide-react";
import { useRef } from "react";
import { formatTimeAmount } from "@/lib/time";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// One hour's journey through escrow (FR-2.2 → FR-6.1 → FR-8.3 → FR-2.3), scrubbed by scroll.
// Balances are integer minutes, formatted the same way as everywhere else in the app.
const STEPS = [
  { title: "تحجز جلسة لساعة", body: "تنتقل الساعة من رصيدك المتاح إلى الرصيد المجمّد. لا يصل إليها أحد بعد." },
  { title: "تتعلّمان معاً", body: "غرفة واحدة، أجندة تُؤشَّر بنداً بنداً، وملاحظات وأكواد تبقى في أرشيفك." },
  { title: "تحلّ الاختبار القصير", body: "عندها فقط تُحرَّر الساعة إلى رصيد المدرّس، ويبدأ هو بالتعلّم بها." },
];

const AGENDA = ["مقدمة نظرية", "تمرين تطبيقي", "مراجعة وأسئلة"];

export function EscrowStory() {
  const root = useRef<HTMLElement>(null);
  const learnerAvailable = useRef<HTMLSpanElement>(null);
  const learnerFrozen = useRef<HTMLSpanElement>(null);
  const teacherAvailable = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const balances = { learnerAvailable: 120, learnerFrozen: 0, teacherAvailable: 0 };
      const render = () => {
        if (learnerAvailable.current) learnerAvailable.current.textContent = formatTimeAmount(Math.round(balances.learnerAvailable));
        if (learnerFrozen.current) learnerFrozen.current.textContent = formatTimeAmount(Math.round(balances.learnerFrozen));
        if (teacherAvailable.current) teacherAvailable.current.textContent = formatTimeAmount(Math.round(balances.teacherAvailable));
      };
      render();

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=220%",
            scrub: 0.6,
            pin: "[data-escrow-stage]",
            anticipatePin: 1,
          },
        });

        tl.set("[data-step]", { autoAlpha: 0.32 })
          .set("[data-step='0']", { autoAlpha: 1 })
          // 1. request: available → frozen, the bead moves into the vault and turns turquoise
          .to("[data-bead]", { "--bead": 0.5, backgroundColor: "var(--cs-cyan)", boxShadow: "0 0 28px var(--cs-cyan)", duration: 1 })
          .to(balances, { learnerAvailable: 60, learnerFrozen: 60, duration: 1, onUpdate: render }, "<")
          .to("[data-vault]", { borderColor: "var(--cs-cyan)", duration: 0.4 }, "<0.6")
          // 2. the session: agenda items tick
          .to("[data-step='0']", { autoAlpha: 0.32, duration: 0.2 })
          .to("[data-step='1']", { autoAlpha: 1, duration: 0.2 }, "<")
          .to("[data-tick]", { autoAlpha: 1, scale: 1, duration: 0.3, stagger: 0.35 })
          // 3. quiz solved: frozen → teacher, bead leaves the vault in brass
          .to("[data-step='1']", { autoAlpha: 0.32, duration: 0.2 })
          .to("[data-step='2']", { autoAlpha: 1, duration: 0.2 }, "<")
          .to("[data-bead]", { "--bead": 1, backgroundColor: "var(--cs-amber)", boxShadow: "0 0 28px var(--cs-amber)", duration: 1 })
          .to(balances, { learnerFrozen: 0, teacherAvailable: 60, duration: 1, onUpdate: render }, "<")
          .to("[data-vault]", { borderColor: "var(--cs-line-strong)", duration: 0.4 }, "<0.4");
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        // No scrubbing: show the finished journey.
        Object.assign(balances, { learnerAvailable: 60, learnerFrozen: 0, teacherAvailable: 60 });
        render();
        gsap.set("[data-tick]", { autoAlpha: 1, scale: 1 });
        gsap.set("[data-bead]", { "--bead": 1 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="escrow-title" className="relative">
      <div data-escrow-stage className="flex min-h-svh flex-col justify-center gap-10 py-16">
        <div className="max-w-2xl space-y-3">
          <h2 id="escrow-title" className="text-3xl leading-snug md:text-5xl md:leading-tight">
            رحلة ساعة واحدة
          </h2>
          <p className="text-muted">
            لا تنتقل الساعة من متعلّم إلى مدرّس إلا بعد أن يحدث التعلّم فعلاً. هكذا تعمل المحفظة من الداخل.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr] lg:items-center">
          <ol className="space-y-5">
            {STEPS.map((s, i) => (
              <li key={s.title} data-step={i} className="flex gap-4">
                <span className="cs-num mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-sm text-muted">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-fg">{s.title}</h3>
                  <p className="text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-[1.75rem] border border-line bg-surface/70 p-5 shadow-card backdrop-blur md:p-8">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 md:gap-6">
              <Wallet label="المتعلّم">
                <Row label="متاح">
                  <span ref={learnerAvailable} className="cs-num text-amber-ink" />
                </Row>
                <Row label="مجمّد">
                  <span ref={learnerFrozen} className="cs-num text-cyan-ink" />
                </Row>
              </Wallet>

              <div
                data-vault
                className="mt-3 grid size-20 place-items-center rounded-full border-2 border-dashed border-line-strong text-center text-[0.7rem] leading-tight text-muted md:size-28 md:text-xs"
              >
                الضمان
              </div>

              <Wallet label="المدرّس">
                <Row label="متاح">
                  <span ref={teacherAvailable} className="cs-num text-amber-ink" />
                </Row>
              </Wallet>
            </div>

            {/* The hour itself, travelling from the learner (start) to the teacher (end). */}
            <div className="relative mx-6 mt-8 h-1 rounded-full bg-line" aria-hidden>
              <span
                data-bead
                style={{ insetInlineStart: "calc(var(--bead, 0) * 100%)" }}
                className="absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-amber shadow-[0_0_28px_var(--cs-amber)] rtl:translate-x-1/2 ltr:-translate-x-1/2"
              />
            </div>

            <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label="أجندة الجلسة">
              {AGENDA.map((item) => (
                <li key={item} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-muted">
                  <Check data-tick className="size-3.5 scale-50 text-success opacity-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Wallet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-raised/60 p-3 md:p-4">
      <p className="text-sm font-semibold text-fg">{label}</p>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
