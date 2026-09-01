import { createSql } from "./database.mjs";

const sql = createSql();
try {
  const [status] = await sql`SELECT current_database() AS database, current_user AS user`;
  const [counts] = await sql`SELECT
    (SELECT COUNT(*)::int FROM footprints) AS footprints,
    (SELECT COUNT(*)::int FROM footprint_photos) AS photos`;
  console.log({ ...status, ...counts });
} finally {
  await sql.end();
}
