import { Hourglass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      className="mx-auto mt-10 max-w-xl"
      icon={<Hourglass />}
      title="هذه الصفحة لم تُبنَ بعد"
      description="إما أن الرابط غير صحيح، أو أن هذه الصفحة ضمن مرحلة قادمة من المشروع."
      action={
        <ButtonLink href="/" variant="outline">
          العودة إلى الرئيسية
        </ButtonLink>
      }
    />
  );
}
