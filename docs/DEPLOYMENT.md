# النشر على الإنترنت (عرض حقيقي)

المكوّنات كلها مجانية:

| الجزء | الخدمة | لماذا |
|---|---|---|
| الموقع | [Vercel](https://vercel.com) | يدعم Next.js مباشرة، و HTTPS تلقائي (NFR-1) |
| قاعدة البيانات | [Neon](https://neon.tech) | PostgreSQL مستضاف، يدعم إضافة `btree_gist` التي نحتاجها |
| المهام المجدولة | GitHub Actions | خطة Vercel المجانية لا تسمح بمهام كل دقيقة، فيستدعيها GitHub كل 5 دقائق (NFR-3) |

الإعدادات الجاهزة في المستودع: `vercel.json` (الخادم في فرانكفورت قرب قاعدة البيانات)، وسكربت `vercel-build` (يطبّق الـ migrations ثم يبني)، و `.github/workflows/scheduled-jobs.yml`.

---

## 1. قاعدة البيانات على Neon

1. سجّل الدخول على neon.tech بحساب GitHub.
2. أنشئ مشروعاً جديداً، واختر المنطقة **Europe (Frankfurt)** ونسخة PostgreSQL الأحدث.
3. من **Connect** انسخ رابط الاتصال **Direct** (بدون `-pooler`). شكله:
   `postgresql://USER:PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

احتفظ به: هو `DATABASE_URL`، وفيه كلمة سر فلا تنشره.

## 2. سرّان تولّدهما بنفسك

في PowerShell داخل مجلد المشروع:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- شغّله مرة، والناتج هو `CRON_SECRET`.
- واختر كلمة سر قوية لحساب المدير على النسخة المنشورة: `SEED_ADMIN_PASSWORD`. (كلمة المدير الافتراضية مكتوبة في README، لذلك يرفض الـ seed استعمالها على قاعدة بيانات مستضافة.)

## 3. الموقع على Vercel

1. سجّل الدخول على vercel.com بحساب GitHub.
2. **Add New → Project**، واختر المستودع `Abdullah24Br/ChronoSwap` ثم **Import**.
3. افتح **Environment Variables** وأضف:

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | رابط Neon من الخطوة 1 |
| `APP_URL` | `https://chronoswap.vercel.app` مؤقتاً، وتُصحَّح بعد أول نشر |
| `GEMINI_API_KEY` | مفتاح Gemini |
| `JOBS_INTERVAL_SECONDS` | `0` (المهام يشغّلها GitHub) |
| `CRON_SECRET` | من الخطوة 2 |

4. اضغط **Deploy**. أثناء البناء تُنشأ الجداول والقيود تلقائياً.
5. بعد النجاح انسخ رابط الموقع (مثل `https://chronoswap-xxxx.vercel.app`)، وضعه في `APP_URL` من **Settings → Environment Variables**، ثم **Deployments → … → Redeploy**.

## 4. أسرار GitHub

في GitHub افتح المستودع ← **Settings → Secrets and variables → Actions → New repository secret**، وأضف أربعة أسرار:

| السر | القيمة |
|---|---|
| `DATABASE_URL` | رابط Neon (نفس قيمة Vercel) |
| `SEED_ADMIN_PASSWORD` | كلمة سر المدير من الخطوة 2 |
| `APP_URL` | رابط الموقع من الخطوة 3 |
| `CRON_SECRET` | نفس قيمة Vercel |

## 5. البيانات الأولية والمهام المجدولة

1. تبويب **Actions** ← **Seed database** ← **Run workflow** (مرة واحدة). ينشئ الجداول والمدير و15 مهارة والمستخدمين التجريبيين الثلاثة (سارة، عمر، ليلى) بحلقة مقايضة جاهزة. يعمل على خوادم GitHub لأن بعض الشبكات المنزلية تحجب منفذ PostgreSQL (5432)، ويمكن إعادة تشغيله بأمان.
2. ثم **Actions** ← **Scheduled jobs** ← **Run workflow** للتجربة. إذا نجح فسيعمل وحده كل 5 دقائق تقريباً.

ملاحظة: يتأخر GitHub أحياناً بضع دقائق، فقد يُكتشف الغياب بعد 20 دقيقة بدل 15. هذا مقبول للعرض.

## 6. (اختياري) البريد الإلكتروني الحقيقي

بدون SMTP لا تصل رسائل تفعيل الحساب، فلا يستطيع المسجّلون الجدد تفعيل حساباتهم، بينما تعمل الحسابات التجريبية عادي. لتفعيل البريد عبر Gmail:

1. فعّل التحقق بخطوتين في حساب Google، ثم أنشئ **App password**.
2. أضف في Vercel:
   - `SMTP_URL` = `smtps://YOUR_GMAIL%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`
   - `MAIL_FROM` = `ChronoSwap <YOUR_GMAIL@gmail.com>`
3. أعد النشر.

## التحقق بعد النشر

- افتح الرابط وسجّل الدخول بحساب سارة، وجرّب `/barter`.
- سجّل الدخول كمدير على `/admin` بكلمة السر التي اخترتها.
- في GitHub ← Actions يجب أن تظهر تشغيلات «Scheduled jobs» ناجحة.
