"use client";

import { Clock, Mail, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TimeAmount } from "@/components/ui/time-amount";
import { useToast } from "@/components/ui/toast";

export function FormShowcase() {
  return (
    <Card className="grid gap-5 p-6 md:grid-cols-2">
      <Input label="البريد الإلكتروني" type="email" placeholder="name@example.com" dir="ltr" startAdornment={<Mail className="size-4" />} />
      <Input label="ابحث عن مهارة" placeholder="مثلاً: بايثون" startAdornment={<Search className="size-4" />} hint="ابحث بالاسم العربي أو الإنجليزي" />
      <Input label="وصف الهدف" placeholder="ما الذي تريد تعلّمه في هذه الجلسة؟" endAdornment={<Clock className="size-4" />} />
      <Input label="كلمة المرور" type="password" defaultValue="123" error="كلمة المرور يجب أن تكون 8 أحرف على الأقل" />
      <Input label="حقل معطّل" disabled placeholder="غير متاح" />
    </Card>
  );
}

export function OverlayShowcase() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => setOpen(true)}>
        فتح نافذة التأكيد
      </Button>
      <Button
        variant="outline"
        onClick={() => toast({ tone: "success", title: "تم قبول الطلب", description: "أُضيفت الجلسة إلى جدولك." })}
      >
        إشعار نجاح
      </Button>
      <Button variant="outline" onClick={() => toast({ tone: "info", title: "تم تجميد 1.5 ساعة", description: "ستُحرَّر للمدرّس بعد اكتمال الجلسة." })}>
        إشعار معلومات
      </Button>
      <Button variant="outline" onClick={() => toast({ tone: "danger", title: "الرصيد المتاح غير كافٍ" })}>
        إشعار خطأ
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="تأكيد حجز الجلسة"
        description="ستُجمَّد الساعات من رصيدك المتاح حتى انتهاء الجلسة."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              تراجع
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                toast({ tone: "success", title: "أُرسل طلب الحجز" });
              }}
            >
              تأكيد الحجز
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-muted">المهارة</dt>
          <dd>أساسيات بايثون</dd>
          <dt className="text-muted">المدة</dt>
          <dd>
            <TimeAmount minutes={90} />
          </dd>
          <dt className="text-muted">المتاح بعد الحجز</dt>
          <dd>
            <TimeAmount minutes={60} tone="amber" />
          </dd>
        </dl>
      </Modal>
    </div>
  );
}
