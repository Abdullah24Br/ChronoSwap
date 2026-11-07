// @prisma/adapter-pg 7.10 sends a transaction's nested queries to one pg client without waiting,
// and pg 8.x prints a deprecation notice for that (pg still runs them one by one, so results are
// correct). It is inside Prisma, not our code, and both packages are on their latest versions.
// Hide exactly this message so real warnings stay visible in the test output. Remove when Prisma
// stops triggering it.
const PG_QUEUE_NOTICE = "Calling client.query() when the client is already executing a query";

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.startsWith(PG_QUEUE_NOTICE)) return;
  return (originalEmitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
