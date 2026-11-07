import { getCurrentUser } from "@/server/auth/session";
import { getSkillsTaxonomy } from "@/server/services/skills/skills-service";
import { searchTeachers } from "@/server/services/search/search-service";
import { findDirectMatches } from "@/server/services/barter/barter-service";
import { ExploreSearch } from "@/components/explore/explore-search";
import { Compass } from "lucide-react";

export const metadata = {
  title: "استكشاف المهارات والمدرّسين",
  description: "ابحث عن مدرّسين حسب المهارة، وصفِّ النتائج حسب التقييم والأوقات المتاحة",
};

export const instant = false;

interface ExplorePageProps {
  searchParams: Promise<{
    q?: string;
    skill?: string;
    cat?: string;
    rating?: string;
    day?: string;
  }>;
}

export default async function ExplorePage(props: ExplorePageProps) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();

  const [categories, searchResults, directMatchData] = await Promise.all([
    getSkillsTaxonomy(),
    searchTeachers({
      query: searchParams.q || undefined,
      skillId: searchParams.skill || undefined,
      categoryId: searchParams.cat || undefined,
      minRating: searchParams.rating ? parseFloat(searchParams.rating) : undefined,
      weekday: searchParams.day !== undefined && searchParams.day !== "" ? parseInt(searchParams.day, 10) : undefined,
      excludeUserId: user?.id,
    }),
    user ? findDirectMatches(user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2.5">
            <Compass className="size-6 text-amber" />
            <span>استكشاف المهارات والمقايضة الذكية</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            ابحث عن مدرّسين لمختلف المهارات، أو اكتشف من يعرض ما تطلبه ويطلب ما تعرضه.
          </p>
        </div>
      </div>

      {/* Main Search & Teachers Directory */}
      <ExploreSearch
        initialTeachers={searchResults.teachers}
        initialTotal={searchResults.total}
        categories={categories}
        currentUserId={user?.id}
        directMatches={directMatchData?.matches ?? []}
        userOfferedCount={directMatchData?.userOfferedCount ?? 0}
        userWantedCount={directMatchData?.userWantedCount ?? 0}
      />
    </div>
  );
}
