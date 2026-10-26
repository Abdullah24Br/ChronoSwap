import { execSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrl } from "./test-database.mts";

// Recreates the test database and applies all migrations (incl. hand-written constraints).
export default async function setup() {
  const testUrl = new URL(testDatabaseUrl());
  const dbName = testUrl.pathname.slice(1);
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
  });
}
