import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DisputeResolver } from "@/components/admin/dispute-resolver";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/session";
import { DomainError, NotFoundError } from "@/server/errors";
import { getDisputeEvidence } from "@/server/services/admin/disputes-admin-service";
import { AlertCircle, ArrowRight } from "lucide-react";

export const instant = false;

export const metadata: Metadata = {
  title: "ملف التحكيم وفض النزاع | ChronoSwap",
  description: "مراجعة أدلة الجلسة وسجل الحضور والأجندة لاتخاذ قرار التحكيم",
};

interface DisputeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DisputeDetailPage({ params }: DisputeDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=/admin/disputes/${id}`);
  }

  if (user.role !== "ADMIN") {
    redirect("/explore");
  }

  let disputeData: Awaited<ReturnType<typeof getDisputeEvidence>> | null = null;
  let domainErrorMessage: string | null = null;

  try {
    disputeData = await getDisputeEvidence(user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError || (err instanceof DomainError && err.code === "NOT_FOUND")) {
      notFound();
    }
    domainErrorMessage = err instanceof Error ? err.message : "حدث خطأ أثناء جلب ملف النزاع";
  }

  if (domainErrorMessage || !disputeData) {
    return (
      <main className="container mx-auto px-4 py-16 max-w-lg">
        <Card className="p-8 text-center border-line">
          <CardContent className="space-y-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-danger/10 text-danger mx-auto">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-bold text-fg">تعذر عرض ملف النزاع</h2>
            <p className="text-xs text-muted leading-relaxed">{domainErrorMessage}</p>
            <div className="pt-2">
              <ButtonLink href="/admin/disputes" variant="outline" size="sm">
                <ArrowRight className="size-4 me-1.5" />
                <span>العودة لقائمة النزاعات</span>
              </ButtonLink>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <DisputeResolver dispute={disputeData} />;
}

