import type { Metadata } from "next";
import { Plus, Search, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionStatusBadge } from "@/components/ui/session-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeAmount } from "@/components/ui/time-amount";
import { WalletSummary } from "@/components/wallet/wallet-summary";
import { SESSION_STATUS_META } from "@/lib/session-status";
import type { SessionStatus } from "@/generated/prisma/enums";
import { FormShowcase, OverlayShowcase } from "./showcase-client";

export const metadata: Metadata = { title: "نظام التصميم" };

const swatches = [
  { name: "canvas", label: "الخلفية", className: "bg-canvas" },
  { name: "surface", label: "السطح", className: "bg-surface" },
  { name: "raised", label: "مرتفع", className: "bg-raised" },
  { name: "fg", label: "النص", className: "bg-fg" },
  { name: "muted", label: "نص ثانوي", className: "bg-muted" },
  { name: "amber", label: "عنبري: العطاء / المتاح", className: "bg-amber" },
  { name: "cyan", label: "سماوي: الأخذ / المجمّد", className: "bg-cyan" },
  { name: "success", label: "نجاح", className: "bg-success" },
  { name: "danger", label: "خطر", className: "bg-danger" },
];

const ledgerSample = [
  { label: "الرصيد الترحيبي", note: "FR-1.2", minutes: 120 },
  { label: "تجميد — جلسة بايثون", note: "FR-2.2", minutes: -90 },
  { label: "تحرير — درّست الإنجليزية", note: "FR-2.3", minutes: 60 },
  { label: "استرجاع — طلب مرفوض", note: "FR-2.4", minutes: 30 },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-line pt-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <Badge tone="amber" className="w-fit">
          المرحلة 0
        </Badge>
        <h1 className="text-3xl font-bold md:text-4xl">نظام التصميم</h1>
        <p className="max-w-2xl text-muted">
          هوية «الوقت عملة»: هادئة وموثوقة. لونان يمثّلان طرفي التبادل: العنبري للعطاء والرصيد المتاح، والسماوي للأخذ
          والرصيد المجمّد.
        </p>
      </header>

      <Section title="الألوان" description="رموز CSS في globals.css، وتتبدّل تلقائياً بين الوضعين الداكن والفاتح.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((s) => (
            <div key={s.name} className="overflow-hidden rounded-xl border border-line">
              <div className={`h-16 ${s.className}`} />
              <div className="flex flex-col gap-0.5 bg-surface px-3 py-2">
                <span className="text-sm">{s.label}</span>
                <code className="cs-num text-xs text-subtle" dir="ltr">
                  {s.name}
                </code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="الخطوط" description="Alexandria للعناوين · IBM Plex Sans Arabic للنصوص · IBM Plex Mono للأرقام.">
        <Card className="flex flex-col gap-4 p-6">
          <p className="font-display text-4xl font-bold">علّم ساعة، تعلّم ساعة</p>
          <p className="font-display text-2xl font-semibold">عنوان فرعي بخط العرض</p>
          <p className="max-w-2xl text-base text-fg">
            نص أساسي بخط مقروء: تُخزَّن جميع الأرصدة كدقائق صحيحة، وتُعرض بالساعات فقط. يُعرض كل وقت بالمنطقة الزمنية
            الخاصة بالمستخدم، بينما يُخزَّن بالتوقيت العالمي الموحد.
          </p>
          <p className="text-sm text-muted">نص ثانوي صغير للتلميحات والتفاصيل.</p>
          <p className="cs-num text-2xl" dir="ltr">
            0123456789 · 18:30 · 1,250.5
          </p>
        </Card>
      </Section>

      <Section title="مقدار الوقت · TimeAmount" description="المدخل دائماً دقائق صحيحة. العرض: أرقام لاتينية + «ساعة».">
        <Card className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[30, 90, 120, 1500].map((m) => (
            <div key={m} className="flex flex-col gap-1">
              <span className="cs-num text-xs text-subtle" dir="ltr">
                {m} min
              </span>
              <TimeAmount minutes={m} size="lg" />
            </div>
          ))}
          <div className="flex flex-wrap items-baseline gap-4 sm:col-span-2 lg:col-span-4">
            <TimeAmount minutes={150} size="xl" tone="amber" />
            <TimeAmount minutes={90} size="lg" tone="cyan" />
            <TimeAmount minutes={60} signed tone="auto" />
            <TimeAmount minutes={-30} tone="auto" />
            <TimeAmount minutes={45} size="sm" tone="muted" />
          </div>
        </Card>
      </Section>

      <Section title="الأزرار">
        <div className="flex flex-wrap items-center gap-3">
          <Button>احجز جلسة</Button>
          <Button variant="accent">قبول الطلب</Button>
          <Button variant="outline">تفاصيل</Button>
          <Button variant="ghost">إلغاء</Button>
          <Button variant="danger">إبلاغ عن مشكلة</Button>
          <Button loading>جارٍ الحفظ</Button>
          <Button disabled>معطّل</Button>
          <Button size="icon" variant="outline" aria-label="إضافة">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" icon={<Search className="size-3.5" />}>
            صغير
          </Button>
          <Button size="md">متوسط</Button>
          <Button size="lg">كبير</Button>
        </div>
      </Section>

      <Section title="الحقول">
        <FormShowcase />
      </Section>

      <Section title="الشارات وحالات الجلسة" description="لكل حالة في SESSION_STATE_MACHINE.md تسمية عربية ولون.">
        <div className="flex flex-wrap gap-2">
          <Badge>محايد</Badge>
          <Badge tone="amber">عنبري</Badge>
          <Badge tone="cyan">سماوي</Badge>
          <Badge tone="success" dot>
            نجاح
          </Badge>
          <Badge tone="danger" dot>
            خطر
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SESSION_STATUS_META) as SessionStatus[]).map((s) => (
            <SessionStatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="البطاقات">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <WalletSummary availableMinutes={150} frozenMinutes={90} debtMinutes={30} />
          <Card accent="cyan">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>أساسيات بايثون</CardTitle>
                <SessionStatusBadge status="ACCEPTED" />
              </div>
              <CardDescription>مع سارة الحلبي · الثلاثاء 18:00</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted">المدة</span>
              <TimeAmount minutes={90} tone="cyan" />
            </CardContent>
            <CardFooter className="justify-end">
              <Button variant="ghost" size="sm">
                إلغاء
              </Button>
              <Button size="sm">دخول الغرفة</Button>
            </CardFooter>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>سجل الحركات</CardTitle>
            <CardDescription>سجلّ لا يُعدَّل ولا يُحذف</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-line px-5 pb-2 pt-3">
            {ledgerSample.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm">{row.label}</span>
                  <span className="cs-num text-xs text-subtle" dir="ltr">
                    {row.note}
                  </span>
                </div>
                <TimeAmount minutes={row.minutes} signed tone="auto" />
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="الهيكل المؤقت · Skeleton">
        <Card className="flex items-center gap-4 p-5">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </Card>
      </Section>

      <Section title="الحالة الفارغة · EmptyState">
        <EmptyState
          icon={<SearchX />}
          title="لا يوجد مدرّسون لهذه المهارة بعد"
          description="جرّب مهارة قريبة، أو أضفها إلى قائمة «مهارات مطلوبة» لنخبرك عند توفّرها."
          action={<Button variant="outline">تعديل البحث</Button>}
        />
      </Section>

      <Section title="النوافذ والإشعارات · Modal & Toast">
        <OverlayShowcase />
      </Section>
    </div>
  );
}
