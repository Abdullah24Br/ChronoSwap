import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getUserSessions } from "@/server/services/sessions/booking-service";
import { SessionsDashboard } from "@/components/sessions/sessions-dashboard";
import { CalendarClock } from "lucide-react";

export const instant = false;

export default async function SessionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const {
    incomingRequests,
    outgoingRequests,
    upcomingSessions,
    pastSessions,
  } = await getUserSessions(user.id);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-line">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-fg flex items-center gap-2.5">
            <CalendarClock className="size-7 text-amber" />
            <span>جلساتي التعليمية</span>
          </h1>
          <p className="text-sm text-muted">
            إدارة الطلبات الواردة من المتعلمين، متابعة طلباتك، والانضمام إلى الجلسات المؤكدة.
          </p>
        </div>
      </div>

      {/* Main Dashboard */}
      <SessionsDashboard
        currentUserId={user.id}
        userTimezone={user.timezone || "Asia/Damascus"}
        incomingRequests={incomingRequests}
        outgoingRequests={outgoingRequests}
        upcomingSessions={upcomingSessions}
        pastSessions={pastSessions}
      />
    </div>
  );
}

