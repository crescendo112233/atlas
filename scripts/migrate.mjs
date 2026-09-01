import { readFile } from "node:fs/promises";
import { createSql } from "./database.mjs";

const sql = createSql();
try {
  const source = await readFile(new URL("../deploy/postgres-init.sql", import.meta.url), "utf8");
  for (const statement of source.split("-- statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    await sql.unsafe(statement);
  }
  console.log("PostgreSQL schema is ready");
} finally {
  await sql.end();
}
