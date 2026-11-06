import { SkillsManager } from "@/components/admin/skills-manager";
import { getCurrentUser } from "@/server/auth/session";
import { getAdminTaxonomy } from "@/server/services/admin/skills-admin-service";

export const instant = false;

export default async function AdminSkillsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;

  const taxonomy = await getAdminTaxonomy(user.id);

  return <SkillsManager initialTaxonomy={taxonomy} />;
}

