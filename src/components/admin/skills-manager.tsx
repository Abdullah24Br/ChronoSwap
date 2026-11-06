"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  archiveCategoryAction,
  archiveSkillAction,
  createCategoryAction,
  createSkillAction,
} from "@/server/actions/admin";
import type { getAdminTaxonomy } from "@/server/services/admin/skills-admin-service";
import {
  AlertCircle,
  Archive,
  FolderPlus,
  Plus,
  Tag,
} from "lucide-react";

export type AdminTaxonomyData = Awaited<ReturnType<typeof getAdminTaxonomy>>;

interface SkillsManagerProps {
  initialTaxonomy: AdminTaxonomyData;
}

export function SkillsManager({ initialTaxonomy }: SkillsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forms visibility
  const [showAddCat, setShowAddCat] = useState(false);
  const [selectedCatForSkill, setSelectedCatForSkill] = useState<string | null>(null);

  // Add category fields
  const [catNameAr, setCatNameAr] = useState("");
  const [catNameEn, setCatNameEn] = useState("");
  const [catSlug, setCatSlug] = useState("");

  // Add skill fields
  const [skillNameAr, setSkillNameAr] = useState("");
  const [skillNameEn, setSkillNameEn] = useState("");
  const [skillSlug, setSkillSlug] = useState("");

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameAr.trim() || !catSlug.trim()) {
      setErrorMessage("الاسم بالعربية والرمز اللطيف مطلوبان");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await createCategoryAction({
        nameAr: catNameAr.trim(),
        nameEn: catNameEn.trim() || undefined,
        slug: catSlug.trim().toLowerCase(),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setCatNameAr("");
      setCatNameEn("");
      setCatSlug("");
      setShowAddCat(false);
      router.refresh();
    });
  };

  const handleCreateSkill = (categoryId: string) => {
    if (!skillNameAr.trim() || !skillSlug.trim()) {
      setErrorMessage("اسم المهارة والرمز اللطيف مطلوبان");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await createSkillAction({
        categoryId,
        nameAr: skillNameAr.trim(),
        nameEn: skillNameEn.trim() || undefined,
        slug: skillSlug.trim().toLowerCase(),
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setSkillNameAr("");
      setSkillNameEn("");
      setSkillSlug("");
      setSelectedCatForSkill(null);
      router.refresh();
    });
  };

  const handleArchiveCategory = (categoryId: string) => {
    if (!confirm("هل أنت متأكد من أرشفة هذا التصنيف وكافة مهاراته؟")) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await archiveCategoryAction({ categoryId });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  const handleArchiveSkill = (skillId: string) => {
    if (!confirm("هل أنت متأكد من أرشفة هذه المهارة؟")) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await archiveSkillAction({ skillId });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-fg">شجرة المهارات والتصنيفات المعتمدة</h2>
          <p className="text-xs text-muted">
            إدارة التصنيفات والمهارات التي يمكن للمستخدمين عرضها أو طلبها في الموقع (FR-7.1).
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setShowAddCat(!showAddCat)}
          className="text-xs self-start"
          icon={<FolderPlus className="size-4" />}
        >
          <span>{showAddCat ? "إلغاء الإضافة" : "إضافة تصنيف جديد"}</span>
        </Button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-red/30 bg-red/10 p-3 text-xs text-red">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Add Category Form */}
      {showAddCat && (
        <Card className="border-line bg-raised/20 p-4">
          <form onSubmit={handleCreateCategory} className="space-y-3">
            <h4 className="text-xs font-bold text-fg flex items-center gap-1.5">
              <FolderPlus className="size-4 text-amber" />
              <span>بيانات التصنيف الجديد</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[0.65rem] text-muted mb-1">الاسم بالعربية *</label>
                <input
                  type="text"
                  placeholder="مثال: تطوير الويب"
                  value={catNameAr}
                  onChange={(e) => setCatNameAr(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-fg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[0.65rem] text-muted mb-1">الاسم بالإنجليزية</label>
                <input
                  type="text"
                  placeholder="e.g. Web Development"
                  value={catNameEn}
                  onChange={(e) => setCatNameEn(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-fg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[0.65rem] text-muted mb-1">الرمز اللطيف (Slug) *</label>
                <input
                  type="text"
                  placeholder="web-development"
                  value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-fg font-mono focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddCat(false)}
                className="text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isPending}
                className="text-xs"
              >
                حفظ التصنيف
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Categories & Skills List */}
      <div className="space-y-4">
        {initialTaxonomy.length === 0 ? (
          <Card className="p-8 text-center border-line">
            <p className="text-xs text-muted">لا توجد تصنيفات مضافة بعد. ابدأ بإضافة تصنيف جديد أعلاه.</p>
          </Card>
        ) : (
          initialTaxonomy.map((category) => (
            <Card key={category.id} className="border-line overflow-hidden">
              <CardHeader className="bg-raised/30 border-b border-line px-5 py-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-fg">{category.nameAr}</h3>
                  {category.nameEn && (
                    <span className="text-xs text-muted">({category.nameEn})</span>
                  )}
                  <span className="font-mono text-[0.65rem] text-subtle px-1.5 py-0.5 rounded bg-surface border border-line">
                    {category.slug}
                  </span>
                  {!category.isActive && (
                    <Badge tone="neutral" className="text-[0.65rem]">
                      مؤرشف
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelectedCatForSkill(
                        selectedCatForSkill === category.id ? null : category.id,
                      )
                    }
                    className="text-xs h-7 px-2"
                  >
                    <Plus className="size-3 me-1" />
                    <span>إضافة مهارة</span>
                  </Button>
                  {category.isActive && (
                    <button
                      type="button"
                      onClick={() => handleArchiveCategory(category.id)}
                      className="p-1 text-muted hover:text-red transition-colors"
                      title="أرشفة التصنيف"
                    >
                      <Archive className="size-3.5" />
                    </button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                {/* Add Skill to this Category Form */}
                {selectedCatForSkill === category.id && (
                  <div className="p-3 rounded-xl border border-line bg-surface space-y-2 mb-3">
                    <h5 className="text-[0.7rem] font-bold text-fg flex items-center gap-1">
                      <Tag className="size-3 text-cyan-ink" />
                      <span>إضافة مهارة جديدة إلى ({category.nameAr})</span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="اسم المهارة بالعربية *"
                        value={skillNameAr}
                        onChange={(e) => setSkillNameAr(e.target.value)}
                        className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs text-fg focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="الاسم بالإنجليزية"
                        value={skillNameEn}
                        onChange={(e) => setSkillNameEn(e.target.value)}
                        className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs text-fg focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="slug (e.g. nextjs) *"
                        value={skillSlug}
                        onChange={(e) => setSkillSlug(e.target.value)}
                        className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs text-fg font-mono focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedCatForSkill(null)}
                        className="text-xs h-6 px-2"
                      >
                        إلغاء
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleCreateSkill(category.id)}
                        className="text-xs h-6 px-2.5"
                      >
                        حفظ المهارة
                      </Button>
                    </div>
                  </div>
                )}

                {/* Skills Grid */}
                {category.skills.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">
                    لا توجد مهارات مضافة في هذا التصنيف بعد.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {category.skills.map((skill) => (
                      <div
                        key={skill.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                          skill.isActive
                            ? "bg-canvas border-line text-fg"
                            : "bg-raised/40 border-line/50 text-muted opacity-70"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-fg">{skill.nameAr}</span>
                            {!skill.isActive && (
                              <span className="text-[0.6rem] text-subtle px-1 rounded bg-raised">
                                معطلة
                              </span>
                            )}
                          </div>
                          <span className="text-[0.65rem] font-mono text-muted block mt-0.5">
                            {skill.slug} • {skill._count.sessions} جلسة
                          </span>
                        </div>

                        {skill.isActive && (
                          <button
                            type="button"
                            onClick={() => handleArchiveSkill(skill.id)}
                            className="p-1 text-muted hover:text-red transition-colors"
                            title="أرشفة المهارة"
                          >
                            <Archive className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
