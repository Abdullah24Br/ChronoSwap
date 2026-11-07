import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SessionRoom } from "@/components/sessions/session-room";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { getSessionRoomData } from "@/server/services/sessions/room-service";
import { AlertCircle, ArrowRight } from "lucide-react";

export const instant = false;

export const metadata: Metadata = {
  title: "غرفة الجلسة",
  description: "غرفة الجلسة التعليمية المباشرة والمحرر التشاركي في منصة ChronoSwap",
};

interface SessionRoomPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionRoomPage({ params }: SessionRoomPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=/sessions/${id}`);
  }

  let sessionData: Awaited<ReturnType<typeof getSessionRoomData>> | null = null;
  let domainErrorMessage: string | null = null;

  try {
    sessionData = await getSessionRoomData(id, user.id);
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === "NOT_FOUND") {
        notFound();
      }
      domainErrorMessage = err.message;
    } else {
      throw err;
    }
  }

  if (domainErrorMessage || !sessionData) {
    return (
      <main className="container mx-auto px-4 py-16 max-w-lg">
        <Card className="p-8 text-center border-line">
          <CardContent className="space-y-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-danger/10 text-danger mx-auto">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-bold text-fg">تعذر الدخول إلى غرفة الجلسة</h2>
            <p className="text-xs text-muted leading-relaxed">{domainErrorMessage}</p>
            <div className="pt-2">
              <ButtonLink href="/sessions" variant="outline" size="sm">
                <ArrowRight className="size-4 me-1.5" />
                <span>العودة للجلسات</span>
              </ButtonLink>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <SessionRoom initialData={sessionData} currentUserId={user.id} />
    </main>
  );
}
