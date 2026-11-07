"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { minutesToTimeString, WEEKDAYS } from "@/lib/time";
import type { TeacherSearchResult } from "@/server/services/search/search-service";
import type { DirectBarterMatch } from "@/server/services/barter/barter-service";
import type { TaxonomyCategory } from "@/server/services/skills/skills-service";
import {
  ArrowLeftRight,
  Calendar,
  Clock,
  Compass,
  GraduationCap,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

interface ExploreSearchProps {
  initialTeachers: TeacherSearchResult[];
  initialTotal: number;
  categories: TaxonomyCategory[];
  currentUserId?: string;
  directMatches?: DirectBarterMatch[];
  userOfferedCount?: number;
  userWantedCount?: number;
}

export function ExploreSearch({
  initialTeachers,
  initialTotal,
  categories,
  currentUserId,
  directMatches = [],
  userOfferedCount = 0,
  userWantedCount = 0,
}: ExploreSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"all" | "direct">("all");

  const query = searchParams.get("q") ?? "";
  const selectedCategory = searchParams.get("cat") ?? "";
  const selectedSkill = searchParams.get("skill") ?? "";
  const minRating = searchParams.get("rating") ?? "";
  const selectedWeekday = searchParams.get("day") ?? "";

  const [textQuery, setTextQuery] = useState(query);

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === "" || val === undefined) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    startTransition(() => {
      router.push(`/explore?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: textQuery.trim() || null });
  };

  const resetFilters = () => {
    setTextQuery("");
    startTransition(() => {
      router.push("/explore");
    });
  };

  const activeSkills = selectedCategory
    ? categories.find((c) => c.id === selectedCategory)?.skills ?? []
    : [];

  const hasActiveFilters =
    Boolean(query) ||
    Boolean(selectedCategory) ||
    Boolean(selectedSkill) ||
    Boolean(minRating) ||
    Boolean(selectedWeekday);

  return (
    <div className="space-y-8">
      {/* View Switcher Tabs (All Teachers vs Direct Barter Matches) */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "all"
              ? "bg-raised text-fg border border-line-strong"
              : "text-muted hover:text-fg hover:bg-surface"
          }`}
        >
          <Compass className="size-4 text-amber" />
          <span>كافة المدرّسين</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-subtle font-mono">
            {initialTotal}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("direct")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "direct"
              ? "bg-raised text-fg border border-line-strong"
              : "text-muted hover:text-fg hover:bg-surface"
          }`}
        >
          <ArrowLeftRight className="size-4 text-cyan-ink" />
          <span>المقايضة المباشرة</span>
          {directMatches.length > 0 && (
            <span className="rounded-full bg-cyan-soft text-cyan-ink px-2 py-0.5 text-xs font-bold">
              {directMatches.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "direct" ? (
        /* DIRECT BARTER VIEW (FR-3.2) */
        <div className="space-y-6">
          <div className="rounded-xl border border-cyan-ink/20 bg-cyan-soft/30 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-fg flex items-center gap-2 text-base">
                <Zap className="size-5 text-cyan-ink fill-cyan-ink" />
                <span>فرص التطابق المباشر (Direct Barter Matches)</span>
              </h3>
              <p className="text-sm text-muted">
                هؤلاء المستخدمون يعرضون مهارات تطلبها، ويطلبون مهارات تعرضها، فيمكنكما تبادل التعليم: كل ساعة تعلّمها لأحدهم تعود إليك لتتعلّم بها منه. للتبادل دون رصيد مسبق جرّب الحلقات الثلاثية في صفحة المقايضة.
              </p>
            </div>
            <ButtonLink href="/profile" variant="outline" size="sm" icon={<GraduationCap className="size-4" />}>
              تعديل مهاراتي
            </ButtonLink>
          </div>

          {!currentUserId ? (
            <Card className="text-center py-12 px-4">
              <CardContent className="space-y-3 max-w-md mx-auto">
                <h4 className="font-bold text-fg">سجل الدخول لعرض فرص المقايضة المباشرة</h4>
                <p className="text-sm text-muted">
                  تحتاج لتسجيل الدخول وتحديد مهاراتك المعروضة والمطلوبة لاكتشاف الشركاء المتطابقين معك مباشرة.
                </p>
                <ButtonLink href="/login" size="md" variant="primary" className="mt-2">
                  تسجيل الدخول
                </ButtonLink>
              </CardContent>
            </Card>
          ) : userOfferedCount === 0 || userWantedCount === 0 ? (
            <Card className="text-center py-12 px-4">
              <CardContent className="space-y-3 max-w-md mx-auto">
                <h4 className="font-bold text-fg">أضف مهاراتك للبدء بالمقايضة</h4>
                <p className="text-sm text-muted">
                  لتفعيل التطابق المباشر، يجب تحديد مهارة واحدة على الأقل تعرضها وأخرى تطلبها في ملفك الشخصي.
                </p>
                <ButtonLink href="/profile" size="md" variant="primary" className="mt-2">
                  إدارة مصفوفة المهارات
                </ButtonLink>
              </CardContent>
            </Card>
          ) : directMatches.length === 0 ? (
            <Card className="text-center py-14 px-4">
              <CardContent className="space-y-3 max-w-md mx-auto">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-surface border border-line mx-auto text-muted">
                  <ArrowLeftRight className="size-6 text-subtle" />
                </div>
                <h4 className="font-bold text-fg">لا توجد تطابقات مباشرة حالياً</h4>
                <p className="text-sm text-muted">
                  لم نجد حالياً مستخدمين يعرضون ما تطلبه ويطلبون ما تعرضه بدقة. يمكنك البحث في قائمة المدرّسين العادية، أو إضافة مهارات إضافية لزيادة فرص التطابق.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {directMatches.map((match) => (
                <DirectMatchCard key={match.partner.id} match={match} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ALL TEACHERS SEARCH VIEW (FR-3.1) */
        <div className="space-y-8">
          {/* Search & Filters Bar */}
          <Card className="shadow-sm border-line bg-surface p-4 sm:p-6">
            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
                  <Input
                    type="search"
                    placeholder="ابحث بالاسم، المهارة، أو الكلمات المفتاحية..."
                    value={textQuery}
                    onChange={(e) => setTextQuery(e.target.value)}
                    className="ps-10 h-11"
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isPending}
                  icon={<Search className="size-4" />}
                >
                  بحث
                </Button>
              </div>

              {/* Quick Filters Row */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2">
                {/* Category Filter */}
                <div>
                  <label htmlFor="cat-filter" className="block text-xs font-medium text-muted mb-1">
                    التصنيف
                  </label>
                  <select
                    id="cat-filter"
                    value={selectedCategory}
                    onChange={(e) =>
                      updateFilters({ cat: e.target.value || null, skill: null })
                    }
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg transition-colors hover:border-line-strong focus:border-amber focus:outline-none"
                  >
                    <option value="">كافة التصنيفات</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Skill Filter (Dynamic based on selected category) */}
                <div>
                  <label htmlFor="skill-filter" className="block text-xs font-medium text-muted mb-1">
                    المهارة
                  </label>
                  <select
                    id="skill-filter"
                    value={selectedSkill}
                    disabled={!selectedCategory || activeSkills.length === 0}
                    onChange={(e) => updateFilters({ skill: e.target.value || null })}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg transition-colors hover:border-line-strong focus:border-amber focus:outline-none disabled:opacity-50"
                  >
                    <option value="">
                      {selectedCategory ? "كافة مهارات التصنيف" : "اختر تصنيفاً أولاً"}
                    </option>
                    {activeSkills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rating Filter */}
                <div>
                  <label htmlFor="rating-filter" className="block text-xs font-medium text-muted mb-1">
                    الحد الأدنى للتقييم
                  </label>
                  <select
                    id="rating-filter"
                    value={minRating}
                    onChange={(e) => updateFilters({ rating: e.target.value || null })}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg transition-colors hover:border-line-strong focus:border-amber focus:outline-none"
                  >
                    <option value="">أي تقييم</option>
                    <option value="4.5">★ 4.5 فما فوق (ممتاز)</option>
                    <option value="4.0">★ 4.0 فما فوق (جيد جداً)</option>
                    <option value="3.0">★ 3.0 فما فوق</option>
                  </select>
                </div>

                {/* Weekday Availability Filter */}
                <div>
                  <label htmlFor="day-filter" className="block text-xs font-medium text-muted mb-1">
                    الأيام المتاحة
                  </label>
                  <select
                    id="day-filter"
                    value={selectedWeekday}
                    onChange={(e) => updateFilters({ day: e.target.value || null })}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg transition-colors hover:border-line-strong focus:border-amber focus:outline-none"
                  >
                    <option value="">أي يوم في الأسبوع</option>
                    {WEEKDAYS.map((d) => (
                      <option key={d.index} value={d.index.toString()}>
                        {d.nameAr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
                  <span className="text-muted">
                    تم العثور على <strong className="text-fg">{initialTotal}</strong> مدرّس(ين)
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="flex items-center gap-1.5 text-amber-ink hover:underline font-medium cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                </div>
              )}
            </form>
          </Card>

          {/* Teachers Results List */}
          {initialTeachers.length === 0 ? (
            <Card className="text-center py-16 px-4">
              <CardContent className="space-y-4 max-w-md mx-auto">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-surface border border-line mx-auto text-muted">
                  <Compass className="size-7" />
                </div>
                <h3 className="text-lg font-bold text-fg">لم يتم العثور على مدرّسين</h3>
                <p className="text-sm text-muted">
                  لم نجد أي مدرّسين يطابقون معايير البحث والتصفية المحددة. جرب توسيع خيارات البحث أو إعادة ضبط الفلاتر.
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="md" onClick={resetFilters} className="mt-2">
                    إلغاء الفلاتر وعرض الجميع
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {initialTeachers.map((teacher) => (
                <TeacherCard key={teacher.id} teacher={teacher} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DirectMatchCard({ match }: { match: DirectBarterMatch }) {
  const { partner, theyTeachYou, youTeachThem } = match;
  const firstLetter = partner.displayName.slice(0, 1);

  return (
    <Card className="flex flex-col justify-between overflow-hidden shadow-sm border-cyan-ink/30 bg-surface hover:border-cyan transition-all">
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Header: Partner Info */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink font-bold text-lg">
              {firstLetter}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-fg text-base sm:text-lg">{partner.displayName}</h3>
                <Badge tone="cyan" className="text-xs py-0">تطابق مباشر</Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                {partner.ratingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-ink">
                    <Star className="size-3.5 fill-amber text-amber" />
                    <span>{partner.averageRating}</span>
                    <span className="text-subtle font-normal">({partner.ratingCount})</span>
                  </span>
                ) : (
                  <span className="text-subtle">مستخدم جديد</span>
                )}
                <span>•</span>
                <span className="text-subtle">{partner.timezone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mutual Barter Exchange Box */}
        <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-raised/60 p-3.5 border border-line">
          {/* What they will teach you */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-cyan-ink flex items-center gap-1">
              <span>سيعلمك:</span>
            </span>
            <div className="flex flex-wrap gap-1">
              {theyTeachYou.map((s) => (
                <Badge key={s.id} tone="cyan" className="text-xs">
                  {s.nameAr}
                </Badge>
              ))}
            </div>
          </div>

          {/* What you will teach them */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-amber-ink flex items-center gap-1">
              <span>ستعلّمه بالمقابل:</span>
            </span>
            <div className="flex flex-wrap gap-1">
              {youTeachThem.map((s) => (
                <Badge key={s.id} tone="amber" className="text-xs">
                  {s.nameAr}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {partner.bio && (
          <p className="text-xs text-muted line-clamp-2 leading-relaxed">
            {partner.bio}
          </p>
        )}
      </CardContent>

      {/* Action Footer */}
      <div className="bg-raised/40 px-5 py-3 border-t border-line flex items-center justify-between">
        <span className="text-xs text-subtle font-medium">
          حجز عادي: تُجمَّد مدة الجلسة من رصيدك حتى إتمامها
        </span>
        <ButtonLink
          href={`/sessions/new?teacherId=${partner.id}${theyTeachYou[0] ? `&skillId=${theyTeachYou[0].id}` : ""}`}
          size="sm"
          variant="primary"
          icon={<ArrowLeftRight className="size-3.5" />}
        >
          احجز جلسة معه
        </ButtonLink>
      </div>
    </Card>
  );
}

function TeacherCard({ teacher }: { teacher: TeacherSearchResult }) {
  const firstLetter = teacher.displayName.slice(0, 1);

  // Group availability by weekdays
  const daysWithSlots = Array.from(
    new Set(teacher.availabilitySlots.map((s) => s.weekday)),
  ).sort((a, b) => a - b);

  return (
    <Card className="flex flex-col justify-between overflow-hidden shadow-sm hover:border-line-strong transition-all">
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Header: Avatar, Name, Rating */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-amber-ink font-bold text-lg">
              {firstLetter}
            </span>
            <div>
              <h3 className="font-bold text-fg text-base sm:text-lg">{teacher.displayName}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                {teacher.ratingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-ink">
                    <Star className="size-3.5 fill-amber text-amber" />
                    <span>{teacher.averageRating}</span>
                    <span className="text-subtle font-normal">
                      ({teacher.ratingCount} تقييم)
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-subtle">
                    <Sparkles className="size-3.5 text-muted" />
                    <span>مدرّس جديد</span>
                  </span>
                )}
                <span>•</span>
                <span className="text-subtle">{teacher.timezone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bio */}
        {teacher.bio && (
          <p className="text-sm text-muted line-clamp-2 leading-relaxed">
            {teacher.bio}
          </p>
        )}

        {/* Offered Skills */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-subtle flex items-center gap-1.5">
            <GraduationCap className="size-3.5 text-amber" />
            <span>المهارات المعروضة:</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {teacher.offeredSkills.map((s) => (
              <Badge key={s.id} tone="neutral" className="text-xs py-0.5">
                {s.nameAr}
              </Badge>
            ))}
          </div>
        </div>

        {/* Availability Overview */}
        <div className="space-y-1.5 pt-2 border-t border-line text-xs text-muted">
          <p className="font-semibold text-subtle flex items-center gap-1.5">
            <Calendar className="size-3.5 text-cyan-ink" />
            <span>الأوقات المتاحة:</span>
          </p>
          {daysWithSlots.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {daysWithSlots.map((dayIdx) => {
                const dayName = WEEKDAYS.find((d) => d.index === dayIdx)?.nameAr;
                const daySlots = teacher.availabilitySlots.filter((s) => s.weekday === dayIdx);
                const timesText = daySlots
                  .map((s) => `${minutesToTimeString(s.startMinute)}–${minutesToTimeString(s.endMinute)}`)
                  .join(", ");
                return (
                  <span
                    key={dayIdx}
                    className="inline-flex items-center gap-1 rounded bg-raised px-2 py-0.5 text-fg font-medium"
                  >
                    <span>{dayName}:</span>
                    <span className="text-muted font-mono text-[0.7rem]">{timesText}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-subtle italic">لم يحدد مواعيد أسبوعية بعد</span>
          )}
        </div>
      </CardContent>

      {/* Action Footer */}
      <div className="bg-raised/40 px-5 py-3 border-t border-line flex items-center justify-between">
        <span className="text-xs text-subtle">
          بنك الوقت: <strong className="text-amber-ink">1 ساعة تعليم = 1 ساعة تعلّم</strong>
        </span>
        <ButtonLink
          href={`/sessions/new?teacherId=${teacher.id}`}
          size="sm"
          variant="primary"
          icon={<Clock className="size-3.5" />}
        >
          طلب جلسة
        </ButtonLink>
      </div>
    </Card>
  );
}
