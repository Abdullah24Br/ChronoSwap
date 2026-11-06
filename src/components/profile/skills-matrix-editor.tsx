"use client";

import { useMemo, useState, useTransition } from "react";
import { updateSkillsAction } from "@/server/actions/skills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Check,
  CheckCircle2,
  GraduationCap,
  Layers,
  Search,
  Sparkles,
  X,
} from "lucide-react";

export interface SkillItem {
  id: string;
  nameAr: string;
  nameEn: string | null;
  slug: string;
  categoryId: string;
}

export interface CategoryItem {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  skills: SkillItem[];
}

interface SkillsMatrixEditorProps {
  categories: CategoryItem[];
  initialOfferedIds: string[];
  initialWantedIds: string[];
}

export function SkillsMatrixEditor({
  categories,
  initialOfferedIds,
  initialWantedIds,
}: SkillsMatrixEditorProps) {
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set(initialOfferedIds));
  const [wantedIds, setWantedIds] = useState<Set<string>>(new Set(initialWantedIds));
  const [searchQuery, setSearchQuery] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Map of all skills by ID for fast label lookup
  const skillsMap = useMemo(() => {
    const map = new Map<string, SkillItem>();
    for (const cat of categories) {
      for (const s of cat.skills) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [categories]);

  // Toggle skill to offered
  const toggleOffered = (skillId: string) => {
    setSaveSuccess(false);
    setErrorMessage(null);
    setOfferedIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
        // Automatically remove from wanted (FR-1.3 disjointness)
        setWantedIds((w) => {
          const wNext = new Set(w);
          wNext.delete(skillId);
          return wNext;
        });
      }
      return next;
    });
  };

  // Toggle skill to wanted
  const toggleWanted = (skillId: string) => {
    setSaveSuccess(false);
    setErrorMessage(null);
    setWantedIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
        // Automatically remove from offered (FR-1.3 disjointness)
        setOfferedIds((o) => {
          const oNext = new Set(o);
          oNext.delete(skillId);
          return oNext;
        });
      }
      return next;
    });
  };

  // Remove completely
  const removeSkill = (skillId: string) => {
    setSaveSuccess(false);
    setErrorMessage(null);
    setOfferedIds((prev) => {
      const next = new Set(prev);
      next.delete(skillId);
      return next;
    });
    setWantedIds((prev) => {
      const next = new Set(prev);
      next.delete(skillId);
      return next;
    });
  };

  const handleSave = () => {
    setErrorMessage(null);
    setSaveSuccess(false);

    startTransition(async () => {
      const res = await updateSkillsAction({
        offeredSkillIds: Array.from(offeredIds),
        wantedSkillIds: Array.from(wantedIds),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setSaveSuccess(true);
      }
    });
  };

  // Filter categories and skills by search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;

    return categories
      .map((cat) => ({
        ...cat,
        skills: cat.skills.filter(
          (s) =>
            s.nameAr.toLowerCase().includes(q) ||
            (s.nameEn && s.nameEn.toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.skills.length > 0);
  }, [categories, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Offered Skills Summary Card */}
        <Card accent="amber" className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-amber-soft text-amber-ink">
                  <GraduationCap className="size-4" />
                </span>
                <div>
                  <CardTitle className="text-base">مهارات أعرضها (تدريس)</CardTitle>
                  <CardDescription className="text-xs">
                    تدرّسها للآخرين وتكسب مقابلها ساعات في رصيدك
                  </CardDescription>
                </div>
              </div>
              <Badge tone="amber">{offeredIds.size} مهارة</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {offeredIds.size === 0 ? (
              <p className="text-sm text-subtle py-2">لم تحدد أية مهارات معروضة بعد. اختر من القائمة أدناه.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Array.from(offeredIds).map((id) => {
                  const s = skillsMap.get(id);
                  if (!s) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber-ink"
                    >
                      <span>{s.nameAr}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(id)}
                        className="rounded hover:bg-amber/20 p-0.5 text-amber-ink"
                        title="إزالة"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wanted Skills Summary Card */}
        <Card accent="cyan" className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-cyan-soft text-cyan-ink">
                  <BookOpen className="size-4" />
                </span>
                <div>
                  <CardTitle className="text-base">مهارات أطلبها (تعلّم)</CardTitle>
                  <CardDescription className="text-xs">
                    ترغب في تعلمها والاستفادة من خبرات الآخرين
                  </CardDescription>
                </div>
              </div>
              <Badge tone="cyan">{wantedIds.size} مهارة</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {wantedIds.size === 0 ? (
              <p className="text-sm text-subtle py-2">لم تحدد أية مهارات مطلوبة بعد. اختر من القائمة أدناه.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Array.from(wantedIds).map((id) => {
                  const s = skillsMap.get(id);
                  if (!s) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/30 bg-cyan-soft px-2.5 py-1 text-xs font-medium text-cyan-ink"
                    >
                      <span>{s.nameAr}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(id)}
                        className="rounded hover:bg-cyan/20 p-0.5 text-cyan-ink"
                        title="إزالة"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Skills Picker Section */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="size-5 text-amber" />
                <span>اختر مهاراتك من القائمة المعتمدة</span>
              </CardTitle>
              <CardDescription>
                لكل مهارة: انقر على «أعرضها» لتدريسها أو «أطلبها» لتعلمها (FR-1.3)
              </CardDescription>
            </div>
            <div className="w-full sm:w-64">
              <Input
                placeholder="ابحث عن مهارة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startAdornment={<Search className="size-4" />}
                className="h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {errorMessage && (
            <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              {errorMessage}
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-success font-medium">
              <CheckCircle2 className="size-5 shrink-0" />
              <span>تم حفظ مصفوفة المهارات بنجاح! ستظهر الآن في نتائج البحث والمقايضة.</span>
            </div>
          )}

          {filteredCategories.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted">لم يتم العثور على أية مهارات تطابق بحثك.</p>
          ) : (
            filteredCategories.map((category) => (
              <div key={category.id} className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-line">
                  <h4 className="font-semibold text-fg text-sm">{category.nameAr}</h4>
                  {category.nameEn && (
                    <span className="text-xs text-subtle" dir="ltr">
                      ({category.nameEn})
                    </span>
                  )}
                  <span className="text-xs text-muted ms-auto">
                    {category.skills.length} مهارات
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {category.skills.map((skill) => {
                    const isOffered = offeredIds.has(skill.id);
                    const isWanted = wantedIds.has(skill.id);

                    return (
                      <div
                        key={skill.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
                          isOffered
                            ? "border-amber bg-amber-soft/40"
                            : isWanted
                              ? "border-cyan bg-cyan-soft/40"
                              : "border-line bg-surface hover:border-line-strong hover:bg-raised/50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-fg truncate">{skill.nameAr}</p>
                          {skill.nameEn && (
                            <p className="text-xs text-subtle truncate" dir="ltr">
                              {skill.nameEn}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleOffered(skill.id)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                              isOffered
                                ? "bg-amber text-on-amber shadow-sm"
                                : "bg-raised text-muted hover:text-amber-ink hover:bg-amber-soft"
                            }`}
                            title="أستطيع تعليم هذه المهارة"
                          >
                            {isOffered && <Check className="inline size-3 me-1" />}
                            أعرضها
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleWanted(skill.id)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                              isWanted
                                ? "bg-cyan text-on-cyan shadow-sm"
                                : "bg-raised text-muted hover:text-cyan-ink hover:bg-cyan-soft"
                            }`}
                            title="أرغب بتعلم هذه المهارة"
                          >
                            {isWanted && <Check className="inline size-3 me-1" />}
                            أطلبها
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Sticky/Bottom Save Bar */}
          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-2xl border border-line-strong bg-canvas/90 p-4 shadow-xl backdrop-blur-md">
            <div className="text-xs sm:text-sm text-muted">
              المجموع: <strong className="text-amber-ink">{offeredIds.size}</strong> معروضة ،{" "}
              <strong className="text-cyan-ink">{wantedIds.size}</strong> مطلوبة
            </div>
            <Button
              variant="primary"
              size="md"
              loading={isPending}
              onClick={handleSave}
              icon={<Sparkles className="size-4" />}
            >
              حفظ مصفوفة المهارات
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

