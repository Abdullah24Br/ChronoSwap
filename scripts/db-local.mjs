// Zero-install local PostgreSQL for development (Windows/macOS/Linux).
// Downloads nothing at runtime: binaries come from the `embedded-postgres` dev dependency.
//
//   npm run db:start      → runs Postgres on localhost:5433 until you press Ctrl+C
//
// Data lives in .data/postgres (git-ignored). Matches DATABASE_URL in .env.example.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { existsSync } from "node:fs";
import net from "node:net";
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

// Is something already listening on the port? (Usually: the database is already running in
// another terminal. Starting a second copy on the same data folder would fail with an unreadable error.)
const portBusy = await new Promise((resolve) => {
  const socket = net.connect({ port: PORT, host: "127.0.0.1" });
  socket.setTimeout(1500);
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("timeout", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});
if (portBusy) {
  const probe = new pg.Client({
    connectionString: `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/postgres`,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  const responds = await probe.connect().then(() => probe.query("SELECT 1")).then(() => true, () => false);
  await probe.end().catch(() => {});
  if (responds) {
    console.log(`\n✔ PostgreSQL is already running on port ${PORT}. Nothing to do.`);
    console.log("  قاعدة البيانات شغّالة أصلاً، فيك تكمّل شغلك.\n");
    process.exit(0);
  }
  console.error(`\n✖ Port ${PORT} is taken by a process that does not answer as PostgreSQL.`);
  console.error("  غالباً نسخة قديمة من Postgres عالقة. أوقفها ثم أعد المحاولة (PowerShell):");
  console.error(
    "  Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | Where-Object { $_.CommandLine -like '*ChronoSwap*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\n",
  );
  process.exit(1);
}

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log("• Initialising a new cluster in .data/postgres …");
  await server.initialise();
}
try {
  await server.start();
} catch (error) {
  console.error("\n✖ PostgreSQL did not start.", error instanceof Error ? error.message : (error ?? ""));
  console.error("  If a previous run was closed abruptly, delete .data/postgres/postmaster.pid and try again.\n");
  process.exit(1);
}

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
