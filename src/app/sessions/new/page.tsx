import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { SessionBookingForm } from "@/components/sessions/session-booking-form";
import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";

export const instant = false;

interface NewSessionPageProps {
  searchParams: Promise<{
    teacherId?: string;
    barter?: string;
    cycleId?: string;
    skillId?: string;
  }>;
}

export default async function NewSessionPage({ searchParams }: NewSessionPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const teacherId = params.teacherId;
  const isBarter = params.barter === "true" || !!params.cycleId;
  const barterCycleId = params.cycleId;
  const defaultSkillId = params.skillId;

  if (!teacherId || teacherId === user.id) {
    redirect("/explore");
  }

  // Fetch teacher details
  const teacher = await db.user.findUnique({
    where: { id: teacherId, role: "USER" },
    include: {
      skills: {
        where: { kind: "OFFERED" },
        include: { skill: { include: { category: true } } },
      },
      availability: {
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      },
    },
  });

  if (!teacher) {
    redirect("/explore");
  }

  // Fetch user's wallet
  const wallet = await db.wallet.findUnique({
    where: { userId: user.id },
  });

  const offeredSkills = teacher.skills.map((s) => ({
    id: s.skill.id,
    slug: s.skill.slug,
    nameAr: s.skill.nameAr,
    categoryNameAr: s.skill.category.nameAr,
  }));

  const availabilitySlots = teacher.availability.map((s) => ({
    weekday: s.weekday,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
  }));

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg font-medium transition-colors"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
          <span>العودة إلى استكشاف المدرّسين</span>
        </Link>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-fg flex items-center gap-2.5">
          <Clock className="size-7 text-amber" />
          <span>طلب حجز جلسة تعليمية</span>
        </h1>
        <p className="text-sm text-muted">
          اختر المهارة والموعد المناسبين لك وللمدرّس، وسيقوم النظام بتجميد الساعات بأمان في الضمان حتى إتمام الجلسة.
        </p>
      </div>

      {/* Booking Form */}
      <SessionBookingForm
        teacher={{
          id: teacher.id,
          displayName: teacher.displayName,
          avatarUrl: teacher.avatarUrl,
          timezone: teacher.timezone,
          offeredSkills,
          availabilitySlots,
        }}
        learnerAvailableMinutes={wallet?.availableMinutes ?? 0}
        learnerDebtMinutes={wallet?.debtMinutes ?? 0}
        isBarter={isBarter}
        barterCycleId={barterCycleId}
        defaultSkillId={defaultSkillId}
      />
    </div>
  );
}

