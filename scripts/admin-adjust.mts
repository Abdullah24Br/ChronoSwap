// Admin balance correction (NFR-2): adds (or removes) available minutes as an ADMIN_ADJUSTMENT
// ledger entry through postLedgerEntries, never by editing the wallet row.
//   npx tsx --env-file=.env scripts/admin-adjust.mts <email> <minutes> "<reason>" [key]
// Example (live DB): npx tsx --env-file=.env.deploy scripts/admin-adjust.mts omar@chronoswap.test 600 "test hours"
// The optional key makes a re-run a no-op (idempotent); default: one adjustment per email+minutes+reason.
import { db } from "../src/server/db";
import { postLedgerEntries, withWalletTransaction } from "../src/server/services/wallet/ledger";

const [email, minutesArg, reason, keyArg] = process.argv.slice(2);
const minutes = Number(minutesArg);
if (!email || !Number.isInteger(minutes) || minutes === 0 || !reason) {
  console.error('Usage: scripts/admin-adjust.mts <email> <integer minutes> "<reason>" [idempotency key]');
  process.exit(1);
}

const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
if (!user) {
  console.error(`No user with e-mail ${email}`);
  process.exit(1);
}
const admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });

const result = await withWalletTransaction(db, (tx) =>
  postLedgerEntries(tx, [
    {
      userId: user.id,
      type: "ADMIN_ADJUSTMENT",
      delta: { available: minutes },
      idempotencyKey: keyArg ?? `admin-adjust:${email}:${minutes}:${reason}`,
      actorId: admin?.id,
      memo: reason,
    },
  ]),
);

const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
console.log(result.applied ? "Applied." : "Already applied earlier (idempotent): nothing changed.");
console.log(`available=${wallet.availableMinutes} frozen=${wallet.frozenMinutes} debt=${wallet.debtMinutes} (minutes)`);
process.exit(0);
