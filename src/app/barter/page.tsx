import { ArrowLeftRight } from "lucide-react";
import { redirect } from "next/navigation";
import { BarterHub } from "@/components/barter/barter-hub";
import { getCurrentUser } from "@/server/auth/session";
import { getBarterOverview } from "@/server/services/barter/barter-overview";
import { findThreeWayCycles } from "@/server/services/barter/barter-service";

export const metadata = {
  title: "المقايضة الثلاثية",
  description: "حلقات تبادل ثلاثية: كل طرف يعلّم بقدر ما يتعلّم، دون رصيد مسبق",
};

export const instant = false;

// FR-3.3 / FR-3.4: suggested 3-way cycles and the user's own cycles.
export default async function BarterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin"); // Q-26: admins do not trade

  const [suggestions, overview] = await Promise.all([
    findThreeWayCycles(user.id),
    getBarterOverview(user.id),
  ]);

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-fg">
          <ArrowLeftRight className="size-6 text-amber" />
          <span>المقايضة الثلاثية</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          يعلّم كل طرف الطرفَ التالي في الحلقة، فيعطي من الساعات بقدر ما يأخذ ولا يُجمَّد أي رصيد.
          تُفعَّل الحلقة بعد موافقة الأطراف الثلاثة على مدة موحّدة، ثم يحجز كل متعلّم جلسته كالمعتاد.
        </p>
      </div>

      <BarterHub
        timezone={user.timezone}
        suggestions={suggestions.cycles}
        userOfferedCount={suggestions.userOfferedCount}
        userWantedCount={suggestions.userWantedCount}
        overview={overview}
      />
    </div>
  );
}
