import "dotenv/config";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { normalizeEmail } from "../src/server/auth/tokens";
import { ensureWallet, grantWelcomeBonus } from "../src/server/services/wallet/wallet-service";

// Idempotent: safe to run repeatedly (`npm run db:seed`).
// FR-1.1: the ADMIN account exists only because this script creates it.

const ADMIN_EMAIL = normalizeEmail(process.env.SEED_ADMIN_EMAIL ?? "admin@chronoswap.test");
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin#ChronoSwap2026";
const DEMO_PASSWORD = "Demo#ChronoSwap2026";

const CATEGORIES: { slug: string; nameAr: string; nameEn: string; skills: [string, string, string][] }[] = [
  {
    slug: "programming",
    nameAr: "البرمجة والتقنية",
    nameEn: "Programming & Tech",
    skills: [
      ["python", "بايثون", "Python"],
      ["javascript", "جافاسكربت", "JavaScript"],
      ["react", "تطوير الواجهات بـ React", "React"],
      ["sql", "قواعد البيانات SQL", "SQL"],
      ["git", "إدارة الشيفرة بـ Git", "Git"],
    ],
  },
  {
    slug: "languages",
    nameAr: "اللغات",
    nameEn: "Languages",
    skills: [
      ["english", "اللغة الإنجليزية", "English"],
      ["german", "اللغة الألمانية", "German"],
      ["turkish", "اللغة التركية", "Turkish"],
      ["arabic-writing", "الكتابة العربية", "Arabic writing"],
    ],
  },
  {
    slug: "design",
    nameAr: "التصميم",
    nameEn: "Design",
    skills: [
      ["ui-ux", "تصميم واجهات المستخدم", "UI/UX design"],
      ["figma", "فيغما", "Figma"],
      ["photoshop", "فوتوشوب", "Photoshop"],
    ],
  },
  {
    slug: "science",
    nameAr: "العلوم والرياضيات",
    nameEn: "Science & Math",
    skills: [
      ["calculus", "التفاضل والتكامل", "Calculus"],
      ["statistics", "الإحصاء", "Statistics"],
      ["physics", "الفيزياء", "Physics"],
    ],
  },
];

// A ready-made barter triangle for FR-3.3: سارة → عمر → ليلى → سارة ("X → Y" = X teaches Y).
const DEMO_USERS = [
  {
    email: "sara@chronoswap.test",
    displayName: "سارة الحلبي",
    bio: "مطوّرة بايثون، أتعلّم التصميم.",
    timezone: "Asia/Damascus",
    offers: ["python", "sql"],
    wants: ["ui-ux"],
  },
  {
    email: "omar@chronoswap.test",
    displayName: "عمر الشامي",
    bio: "طالب هندسة، أحب الإنجليزية.",
    timezone: "Asia/Damascus",
    offers: ["english", "calculus"],
    wants: ["python"],
  },
  {
    email: "layla@chronoswap.test",
    displayName: "ليلى المصري",
    bio: "مصممة واجهات تعيش في برلين.",
    timezone: "Europe/Berlin",
    offers: ["ui-ux", "figma"],
    wants: ["english"],
  },
];

async function main() {
  // Skills & categories (FR-7.1 data)
  const skillIds = new Map<string, string>();
  for (const [position, c] of CATEGORIES.entries()) {
    const category = await db.skillCategory.upsert({
      where: { slug: c.slug },
      update: { nameAr: c.nameAr, nameEn: c.nameEn, position },
      create: { slug: c.slug, nameAr: c.nameAr, nameEn: c.nameEn, position },
    });
    for (const [slug, nameAr, nameEn] of c.skills) {
      const skill = await db.skill.upsert({
        where: { slug },
        update: { nameAr, nameEn, categoryId: category.id },
        create: { slug, nameAr, nameEn, categoryId: category.id },
      });
      skillIds.set(slug, skill.id);
    }
  }

  // Admin (no wallet: admins do not take part in sessions)
  await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      displayName: "مدير النظام",
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });

  // Demo users: verified, welcome bonus through the ledger (FR-1.2), skills (FR-1.3), slots (FR-1.4)
  const demoHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: demoHash,
        displayName: u.displayName,
        bio: u.bio,
        timezone: u.timezone,
        emailVerifiedAt: new Date(),
      },
    });
    await db.$transaction((tx) => ensureWallet(tx, user.id));
    await grantWelcomeBonus(db, user.id);

    await db.userSkill.createMany({
      data: [
        ...u.offers.map((s) => ({ userId: user.id, skillId: skillIds.get(s)!, kind: "OFFERED" as const })),
        ...u.wants.map((s) => ({ userId: user.id, skillId: skillIds.get(s)!, kind: "WANTED" as const })),
      ],
      skipDuplicates: true,
    });

    if ((await db.availabilitySlot.count({ where: { userId: user.id } })) === 0) {
      // Sun / Tue / Thu 18:00–21:00 local time
      await db.availabilitySlot.createMany({
        data: [0, 2, 4].map((weekday) => ({
          userId: user.id,
          weekday,
          startMinute: 18 * 60,
          endMinute: 21 * 60,
          timezone: u.timezone,
        })),
      });
    }
  }

  const counts = {
    categories: await db.skillCategory.count(),
    skills: await db.skill.count(),
    users: await db.user.count(),
    ledgerEntries: await db.ledgerEntry.count(),
  };
  console.log("✔ Seed complete", counts);
  console.log(`  Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Demo users (${DEMO_PASSWORD}): ${DEMO_USERS.map((u) => u.email).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
