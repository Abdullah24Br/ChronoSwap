import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getUserAvailability } from "@/server/services/availability/availability-service";
import { getSkillsTaxonomy, getUserSkills } from "@/server/services/skills/skills-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WalletSummary } from "@/components/wallet/wallet-summary";
import { AvailabilityEditor } from "@/components/profile/availability-editor";
import { SkillsMatrixEditor } from "@/components/profile/skills-matrix-editor";
import { Clock, Globe, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "الملف الشخصي، المهارات، والأوقات المتاحة",
  description: "إدارة المهارات المعروضة والمطلوبة وجدول الأوقات المتاحة أسبوعياً",
};

export const instant = false;

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch user wallet
  const wallet = await db.wallet.findUnique({
    where: { userId: user.id },
  });

  // Fetch skills taxonomy, user skills, and availability slots
  const [categories, userSkills, availability] = await Promise.all([
    getSkillsTaxonomy(),
    getUserSkills(user.id),
    getUserAvailability(user.id),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Profile Header Card */}
      <Card accent="split" className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-amber-soft text-2xl font-bold text-amber-ink">
                {user.displayName.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-fg sm:text-2xl">{user.displayName}</h1>
                  {user.role === "ADMIN" && (
                    <Badge tone="amber" className="gap-1">
                      <ShieldCheck className="size-3.5" />
                      <span>مدير النظام</span>
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted" dir="ltr">
                  {user.email}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-subtle">
                  <span className="inline-flex items-center gap-1">
                    <Globe className="size-3.5" />
                    <span>المنطقة الزمنية: {user.timezone}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    <span>الحساب مفعّل</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Balance Header */}
      {wallet && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-fg">رصيد محفظتك الزمنية</h2>
          <WalletSummary
            availableMinutes={wallet.availableMinutes}
            frozenMinutes={wallet.frozenMinutes}
            debtMinutes={wallet.debtMinutes}
          />
        </section>
      )}

      {/* FR-1.3: Skills Matrix Section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-fg">مصفوفة المهارات</h2>
          <p className="text-sm text-muted">
            حدّد المهارات التي تتقنها وتستطيع تدريسها، والمهارات التي ترغب بتعلّمها ليتم ترشيحك في المقايضة الذكية والبحث.
          </p>
        </div>

        <SkillsMatrixEditor
          categories={categories}
          initialOfferedIds={userSkills.offeredIds}
          initialWantedIds={userSkills.wantedIds}
        />
      </section>

      {/* FR-1.4: Availability Slots Section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-fg">الأوقات المتاحة أسبوعياً</h2>
          <p className="text-sm text-muted">
            حدّد ساعات وفترات توفرك خلال أيام الأسبوع ليتمكن المتعلمون من حجز المواعيد معك وفق منطقتك الزمنية.
          </p>
        </div>

        <AvailabilityEditor
          initialTimezone={availability.timezone}
          initialSlots={availability.slots}
        />
      </section>
    </div>
  );
}
