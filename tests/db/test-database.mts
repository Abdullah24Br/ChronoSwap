/** DATABASE_URL with the database name suffixed by "_test". */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name) throw new Error("DATABASE_URL must include a database name");
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}
