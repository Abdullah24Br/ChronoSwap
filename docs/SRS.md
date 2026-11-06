# ChronoSwap: Software Requirements Specification (structured)

> Source: [`docs/SRS.pdf`](SRS.pdf) (Arabic, v2). This file is a faithful structured copy for developers.
> The Arabic text is the authoritative wording. Each requirement has a one-line English summary.
> Totals: **36 functional + 5 non-functional requirements**.
> Ambiguities and the defaults we chose are listed in [QUESTIONS.md](QUESTIONS.md).

- **Project:** ChronoSwap
- **Model:** بنك الوقت والمقايضة الذكية (time bank + smart barter)
- **Authors:** عبدالله البريدي، يمان عبد الدايم

---

## 1. إدارة الحسابات ومصفوفة المهارات (Accounts & skills matrix)

### FR-1.1
إنشاء حساب وتسجيل الدخول بالبريد الإلكتروني وكلمة المرور، مع تفعيل الحساب عبر رابط تأكيد يُرسل إلى البريد الإلكتروني. يتضمن النظام دورين: مستخدم (متعلم/مدرّس) ومدير نظام يُنشأ حسابه عند تهيئة النظام فقط، ولا يمكن التسجيل به من الواجهة العامة.

*Email + password sign-up and login with an emailed activation link; two roles (USER who can both learn and teach, ADMIN created only at system setup, never via public sign-up).*

### FR-1.2 (الرصيد الترحيبي)
منح كل مستخدم جديد رصيداً مجانياً بقيمة (2 ساعة) فور تفعيل حسابه لبدء طلب الجلسات مباشرة، ويُمنح هذا الرصيد مرة واحدة فقط لكل بريد إلكتروني مفعّل.

*Grant a 2-hour (120 min) welcome balance on activation, once per verified e-mail address.*

### FR-1.3
تحديد قائمتين في الملف الشخصي: مهارات معروضة (Skills Offered) ومهارات مطلوبة (Skills Wanted).

*Profile holds two lists: skills offered and skills wanted.*

### FR-1.4
تحديد جدول الأوقات المتاحة أسبوعياً (Availability Slots) لاستقبال طلبات الجلسات وفق المنطقة الزمنية المحددة في الملف الشخصي؛ تُخزَّن الأوقات بالتوقيت العالمي الموحد (UTC) وتُعرض لكل مستخدم بتوقيته المحلي.

*Weekly availability slots in the user's profile time zone; stored in UTC, shown in each viewer's local time.*

---

## 2. محفظة الوقت ونظام الضمان (Time-Wallet & Escrow)

### FR-2.1
عرض لوحة المحفظة وتضم: الرصيد المتاح، الرصيد المجمّد (Frozen Hours)، وسجل الحركات الزمنية.

*Wallet dashboard: available balance, frozen hours, and transaction history.*

### FR-2.2 (تجميد الرصيد)
خصم عدد ساعات مساوٍ لمدة الجلسة المطلوبة (مثلاً 0.5 ساعة لجلسة 30 دقيقة، و2 ساعة لجلسة 120 دقيقة) وتحويلها إلى "الرصيد المجمّد" عند إرسال طلب الجلسة، مع رفض الطلب إذا كان الرصيد المتاح غير كافٍ.

*On request, move hours equal to the session length from available to frozen; reject the request if available is insufficient.*

### FR-2.3 (تحرير الرصيد)
نقل الساعات المجمّدة تلقائياً من الرصيد المجمّد للمتعلم إلى الرصيد المتاح للمدرّس عند تحقق شروط الإتمام الواردة في (FR-6.1).

*Automatically move the learner's frozen hours to the teacher's available balance once FR-6.1 completion conditions are met.*

### FR-2.4 (الاسترجاع الآلي)
إعادة الساعات المجمّدة إلى الرصيد المتاح للمتعلم فوراً في حال رفض الطلب أو إلغائه وفق قواعد الإلغاء (FR-4.6)، أو صدور قرار مدير النظام لصالحه (FR-7.2).

*Immediately return frozen hours to the learner on rejection, valid cancellation (FR-4.6), or an admin decision in their favour (FR-7.2).*

---

## 3. خوارزمية المقايضة الذكية (Barter Graph Engine)

### FR-3.1
البحث عن المدرّسين حسب المهارة، وتصفية النتائج حسب التقييم والأوقات المتاحة.

*Search teachers by skill; filter by rating and availability.*

### FR-3.2 (التطابق المباشر)
ترشيح المستخدمين الذين يعرضون المهارة المطلوبة ويطلبون مهارة يعرضها المستخدم الحالي.

*Suggest direct matches: users who offer what I want and want what I offer.*

### FR-3.3 (المقايضة الثلاثية الحلقية)
بناء مخطط اتجاهي (Directed Graph) يمثّل فيه السهم X → Y أن X يعرض مهارة يطلبها Y، وإيجاد حلقة ثلاثية مغلقة للتبادل دون الحاجة لرصيد مسبق، بحيث يدرّس A المستخدمَ B، ويدرّس B المستخدمَ C، ويدرّس C المستخدمَ A:

```
A → B → C → A
```

*Build a directed graph (X → Y = X offers a skill Y wants) and find closed 3-cycles so three users can exchange without prior balance.*

### FR-3.4 (تنفيذ الحلقة)
إرسال اقتراح الحلقة إلى الأطراف الثلاثة، ولا تُفعَّل إلا بعد موافقتهم جميعاً على مدة موحّدة للجلسات الثلاث. تُنفَّذ كل جلسة كجلسة عادية (الأقسام 4 و5 و6) دون تجميد رصيد، لأن كل طرف يعطي من الساعات بقدر ما يأخذ. في حال تعذّر إتمام إحدى جلسات الحلقة، تُسوّى الجلسات المكتملة كجلسات عادية بخصم مدتها من الرصيد المتاح للمتعلم المستفيد، وإن لم يكفِ رصيده يُسجَّل الفرق ديناً يُقتطع تلقائياً من أول ساعات يكسبها، ولا يمكنه طلب جلسات جديدة حتى سداده.

*Propose the cycle to all three; activate only when all agree on one shared duration. Each session runs as a normal session without escrow. If any session fails, completed sessions are settled as normal (learner pays from available; any shortfall becomes debt, repaid from the next hours earned, and blocks new requests until repaid).*

---

## 4. حجز الجلسات والأجندة الذكية (AI Session Planner)

### FR-4.1
إرسال طلب حجز جلسة لمدرّس مع تحديد المهارة، الموعد، مدة الجلسة (30 أو 60 أو 90 أو 120 دقيقة)، ووصف نصي قصير للهدف المطلوب، مع التحقق من أن الفترة كاملة تقع ضمن الأوقات المتاحة للمدرّس، ومن عدم تجاوز حد الساعات الأسبوعي بين الطرفين (FR-6.3).

*Booking request with skill, time, duration (30/60/90/120), and short goal; the full period must lie inside the teacher's availability and respect the weekly pair cap (FR-6.3).*

### FR-4.2
تمكين المدرّس من استعراض الطلبات الواردة واختيار (قبول) أو (رفض) الطلب، ويُعدّ الطلب مرفوضاً تلقائياً إذا لم يردّ عليه المدرّس قبل موعد الجلسة.

*Teacher accepts or rejects incoming requests; unanswered requests are auto-rejected at the session start time.*

### FR-4.3 (توليد الأجندة الذكية)
إرسال عنوان المهارة ووصف المتعلم ومدة الجلسة إلى (Gemini API) لتوليد خطة مقترحة تناسب المدة المحجوزة، مقسمة لمهام فرعية قابلة للتأشير.

*Send skill title, learner goal, and duration to Gemini to generate a checkable agenda that fits the booked time.*

### FR-4.4 (البديل الآمن)
توليد أجندة قياسية افتراضية موزعة بنسب من مدة الجلسة (25% نظري، 50% تطبيقي، 25% مراجعة) في حال عدم استجابة الذكاء الاصطناعي.

*If the AI does not respond, use a default agenda: 25% theory, 50% practice, 25% review.*

### FR-4.5 (احتساب المدة)
تُحتسب الجلسة بمدتها المحجوزة كاملة حتى لو انتهت مبكراً، ولا يمكن تمديدها أثناء انعقادها؛ ولمتابعة التعلم يتم حجز جلسة جديدة.

*A session always costs its full booked duration, even if it ends early; it cannot be extended (book another instead).*

### FR-4.6 (الإلغاء والغياب)
يحق للمتعلم إلغاء الطلب قبل قبوله في أي وقت، ولأي من الطرفين إلغاء الجلسة بعد قبولها حتى 12 ساعة قبل موعدها، وتُسترجع الساعات كاملة للمتعلم في الحالتين. أما الإلغاء خلال آخر 12 ساعة، أو عدم دخول غرفة الجلسة خلال 15 دقيقة من موعد بدئها، فيُعدّ غياباً: إن كان من المدرّس تُسترجع الساعات للمتعلم، وإن كان من المتعلم (مع حضور المدرّس) تُحوَّل الساعات للمدرّس.

*Learner may withdraw a pending request any time; either side may cancel an accepted session up to 12h before start (full refund). Cancelling within 12h, or not joining within 15 min of start, is absence: teacher absent → refund the learner; learner absent (teacher present) → hours go to the teacher.*

---

## 5. غرفة الجلسة التفاعلية وبيئة التعليم (Interactive Session Room)

### FR-5.1
إنشاء صفحة خاصة بالجلسة ("غرفة الجلسة") متاحة فقط للمدرّس والمتعلم بعد قبول الطلب، مع تسجيل وقت دخول كل طرف لاعتماده في كشف الغياب (FR-4.6).

*A private session room, available only to the two participants after acceptance; records each side's entry time for no-show detection.*

### FR-5.2 (ربط الاتصال)
إتاحة حقل لوضع رابط مكالمة خارجية (Google Meet / Zoom) مع زر واضح للانضمام المباشر.

*Field for an external call link (Meet/Zoom) with a clear join button.*

### FR-5.3 (مساحة الكود والملاحظات)
توفير محرر نصوص وأكواد برمجية مدمج لكتابة الأكواد والملخصات أثناء الشرح وحفظها.

*Built-in text/code editor for notes and code during the session, saved.*

### FR-5.4 (المؤقت وقائمة الإنجاز)
عرض مؤقت تنازلي بمدة الجلسة المحجوزة مع قائمة مهام الأجندة الذكية، ويمكن لكلا الطرفين تأشير المحاور المنجزة.

*Countdown timer for the booked duration plus the agenda checklist; both sides can tick completed items.*

### FR-5.5 (أرشيف التعلم)
حفظ صفحة الغرفة (بما فيها من أكواد وملاحظات) مع الملخص الذكي للجلسة في سجل المتعلم كمرجع دراسي دائم بعد انتهاء الجلسة.

*After the session, keep the room (notes, code) and AI summary in the learner's permanent learning archive.*

---

## 6. التقييم، التوثيق، ومنع التلاعب (Verification & Anti-Fraud)

### FR-6.1 (تأكيد الإتمام)
يُفعَّل زر "إتمام الجلسة" لكلا الطرفين عند تأشير 50% على الأقل من مهام الأجندة، ويؤدي الضغط عليه إلى إنهاء الجلسة (مع احتسابها كاملة وفق FR-4.5)، وإذا انتهى المؤقت دون الضغط عليه تُنهى الجلسة تلقائياً. بعد الإنهاء تُحرَّر الساعات للمدرّس عندما يحل المتعلم اختبار ما بعد الجلسة (FR-8.3)، أو تلقائياً عند انتهاء المهلة (FR-8.4). وإذا انتهت الجلسة بنسبة إنجاز أقل من 50% تُحال تلقائياً إلى مدير النظام للفصل فيها (FR-7.2).

*"Complete session" is enabled for both sides once ≥50% of agenda tasks are ticked and ends the session (counted in full). The timer ends it automatically otherwise. Hours are released when the learner solves the quiz (FR-8.3) or when the timeout passes (FR-8.4). Sessions ending below 50% are auto-referred to the admin (FR-7.2).*

### FR-6.2
تقييم المدرّس (1 إلى 5 نجوم) وكتابة مراجعة نصية بعد انتهاء الجلسة.

*Learner rates the teacher 1–5 stars with a text review after the session.*

### FR-6.3 (منع التلاعب)
ألا يتجاوز مجموع ساعات الجلسات بين نفس المستخدمَين 3 ساعات خلال أسبوع واحد، لمنع توليد ساعات وهمية، ويُتحقق من هذا الحد عند إرسال طلب الحجز.

*Total session time between the same two users may not exceed 3 hours per week (anti-fraud), checked when a booking is requested.*

### FR-6.4 (نظام الاعتراض)
توفير زر "إبلاغ عن مشكلة" للطرفين، متاح من انتهاء الجلسة حتى تحرير الساعات (بحد أقصى 48 ساعة)، يوقف تحويل الساعات المجمّدة ويحيل الجلسة لمدير النظام.

*"Report a problem" for both sides from session end until release (max 48h); it stops the transfer and refers the session to the admin.*

---

## 7. لوحة تحكم مدير النظام (Admin Panel)

### FR-7.1
إدارة قائمة المهارات والتصنيفات المعتمدة في الموقع (إضافة، تعديل، حذف).

*Admin manages the approved skills and categories (create, edit, delete).*

### FR-7.2 (الفصل في النزاعات)
استعراض الجلسات المعترض عليها والجلسات المحالة تلقائياً (FR-6.1) مع أدلتها (المهام المؤشّرة، الملاحظات، نتيجة الاختبار، أوقات الدخول) واتخاذ قرار بـ "إرجاع الساعات للمتعلم" أو "إرسالها للمدرّس".

*Admin reviews disputed and auto-referred sessions with evidence (ticked tasks, notes, quiz result, join times) and decides "refund learner" or "pay teacher".*

### FR-7.3
عرض إحصائيات عامة للمنصة (إجمالي المستخدمين، الساعات المتبادلة، وأكثر المهارات طلباً).

*Platform statistics: total users, hours exchanged, most-requested skills.*

---

## 8. ملخص الجلسة والاختبار الذكي (AI Session Summary & Quiz)

### FR-8.1 (التوليد الذكي)
عند انتهاء الجلسة، إرسال المهارة والمهام المؤشّرة والملاحظات والأكواد إلى (Gemini API) بطلب واحد لتوليد: ملخص بالنقاط الأساسية مع تمارين مقترحة، واختبار قصير من 3 أسئلة اختيار من متعدد.

*At session end, one Gemini call with skill, ticked tasks, notes, and code generates a key-point summary with exercises plus a 3-question multiple-choice quiz.*

### FR-8.2 (حفظ الملخص)
حفظ الملخص والتمارين في أرشيف التعلم الخاص بالمتعلم إلى جانب الملاحظات والأكواد الأصلية.

*Save summary and exercises to the learner's archive next to the original notes and code.*

### FR-8.3 (حل الاختبار)
تمكين المتعلم من حل الاختبار وعرض النتيجة مع الإجابات الصحيحة، وحفظ النتيجة في سجل الجلسة كدليل على حصول التعلم.

*Learner takes the quiz, sees the score and correct answers; the result is stored on the session as evidence of learning.*

### FR-8.4 (مهلة الاختبار)
تحرير الساعات للمدرّس تلقائياً إذا لم يحل المتعلم الاختبار خلال 48 ساعة من انتهاء الجلسة ولم يقدّم اعتراضاً.

*If the learner hasn't taken the quiz within 48h of the session end and hasn't reported a problem, release the hours to the teacher automatically.*

### FR-8.5 (البديل الآمن)
في حال عدم استجابة الذكاء الاصطناعي، يُعتمد شرط تأشير المهام وحده، وتُحرَّر الساعات للمدرّس تلقائياً بعد 48 ساعة من انتهاء الجلسة ما لم يُقدَّم اعتراض، وتُحفظ الملاحظات والأكواد الأصلية في الأرشيف دون ملخص.

*If the AI fails, only the task-ticking condition applies; hours are released 48h after the session unless disputed; notes and code are archived without a summary.*

### FR-8.6 (الخصوصية)
الاقتصار على إرسال المحتوى التعليمي للجلسة إلى خدمة الذكاء الاصطناعي، دون أي بيانات شخصية (كالأسماء أو البريد الإلكتروني).

*Send only educational content to the AI service, never personal data (names, e-mails).*

---

## 9. المتطلبات غير الوظيفية (Non-Functional Requirements)

### NFR-1 (الأمان)
تخزين كلمات المرور مشفّرة بخوارزمية تجزئة آمنة (مثل bcrypt)، واعتماد اتصال مشفّر (HTTPS)، والتحقق من الصلاحيات في الخادم لكل عملية، كحصر الوصول إلى غرفة الجلسة بطرفيها.

*bcrypt password hashing, HTTPS, server-side authorization for every operation (e.g. only the two participants can enter a room).*

### NFR-2 (سلامة المعاملات)
تنفيذ جميع عمليات المحفظة (التجميد، التحرير، الاسترجاع، التسوية) كمعاملات ذرّية (Atomic Transactions) في قاعدة البيانات، مع سجل حركات لا يمكن تعديله أو حذفه.

*All wallet operations (freeze, release, refund, settle) are atomic DB transactions with an immutable, append-only ledger.*

### NFR-3 (المهام المجدولة)
تشغيل مهام خلفية دورية لتنفيذ العمليات المرتبطة بالوقت: انتهاء مهلة الـ 48 ساعة، والرفض التلقائي للطلبات غير المردود عليها، وكشف الغياب.

*Periodic background jobs for the 48h deadline, auto-rejection of unanswered requests, and no-show detection.*

### NFR-4 (الواجهة)
واجهة باللغة العربية تدعم الكتابة من اليمين إلى اليسار (RTL)، ومتجاوبة مع شاشات الحاسوب والهاتف.

*Arabic RTL interface, responsive on desktop and mobile.*

### NFR-5 (الأداء)
ألا يتجاوز زمن الاستجابة للعمليات العادية ثانيتين، وألا تتعطل الواجهة أثناء انتظار ردود الذكاء الاصطناعي، مع مهلة قصوى 30 ثانية قبل اللجوء إلى البديل الآمن.

*Normal operations respond within 2s; the UI never blocks on AI calls; fall back after a 30s AI timeout.*

---

## Traceability index

| Area | Requirements | Main code location |
|---|---|---|
| Accounts | FR-1.1 – FR-1.4 | `src/server/services/auth/*`, `src/server/auth/*`, `src/server/services/skills/*`, `src/server/services/availability/*`, `src/app/(auth)/*`, `src/app/profile` |
| Wallet | FR-2.1 – FR-2.4, NFR-2 | `src/server/services/wallet/*` (ledger.ts, wallet-service.ts), `src/app/wallet` |
| Search & barter | FR-3.1 – FR-3.4 | `src/server/services/search/*`, `src/server/services/barter/*` (barter-service.ts, barter-overview.ts), `src/app/explore`, `src/app/barter` |
| Sessions | FR-4.1 – FR-4.6, FR-6.x | `src/server/domain/session-state-machine.ts`, `src/server/services/sessions/*` (booking, cancellation, room, timer, release, rating, dispute), `src/app/sessions/*` |
| Room & archive | FR-5.1 – FR-5.5 | `room-service.ts`, `src/components/sessions/session-room.tsx`, `archive-service.ts`, `src/app/archive` |
| Admin | FR-7.1 – FR-7.3 | `src/server/services/admin/*`, `src/app/admin/*` |
| AI | FR-4.3, FR-4.4, FR-8.x, NFR-5 | `src/server/services/ai/*` (gemini-client.ts, agenda-service.ts, summary-quiz-service.ts) |
| Jobs | NFR-3 | `src/server/jobs/run-scheduled-jobs.ts`, `src/instrumentation.ts`, `src/app/api/jobs/run/route.ts` |
