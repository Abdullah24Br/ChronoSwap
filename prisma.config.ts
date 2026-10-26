import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not env(): that throws when .env is missing, which would break `prisma generate` on a fresh `npm install`.
    url: process.env.DATABASE_URL ?? "",
  },
});
