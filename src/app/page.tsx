import { redirect } from "next/navigation";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { Landing } from "@/components/landing/landing";
import { getCurrentUser } from "@/server/auth/session";
import { getHomeSummary } from "@/server/services/dashboard/home-summary";

export const instant = false;

// Visitors see the landing page; signed-in users see their own summary.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  if (user.role === "ADMIN") redirect("/admin"); // Q-26: admins have no wallet or sessions

  const summary = await getHomeSummary(user.id);
  return <HomeDashboard summary={summary} timezone={user.timezone} />;
}
