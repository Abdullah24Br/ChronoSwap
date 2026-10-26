// Zero-install local PostgreSQL for development (Windows/macOS/Linux).
// Downloads nothing at runtime: binaries come from the `embedded-postgres` dev dependency.
//
//   npm run db:start      → runs Postgres on localhost:5433 until you press Ctrl+C
//
// Data lives in .data/postgres (git-ignored). Matches DATABASE_URL in .env.example.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5433;
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "chronoswap";
const dataDir = path.resolve(".data", "postgres");

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Windows defaults to WIN1252, which cannot store Arabic. Force UTF-8.
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-collate=C", "--lc-ctype=C"],
  onLog: () => {},
});

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log("• Initialising a new cluster in .data/postgres …");
  await server.initialise();
}
await server.start();

const client = new pg.Client({
  connectionString: `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/postgres`,
});
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE]);
if (!rowCount) {
  await client.query(`CREATE DATABASE ${DATABASE} ENCODING 'UTF8' TEMPLATE template0`);
  console.log(`• Created database "${DATABASE}"`);
}
await client.end();

console.log(`\n✔ PostgreSQL is running:\n  postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}\n`);
console.log("Keep this terminal open. Press Ctrl+C to stop.\n");

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\n• Stopping PostgreSQL …");
  await server.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Keep the process alive.
setInterval(() => {}, 1 << 30);
