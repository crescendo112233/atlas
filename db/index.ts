import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (client) return client;
  const ssl = process.env.DB_SSL === "true" ? "require" : false;
  client = process.env.DATABASE_URL
    ? postgres(process.env.DATABASE_URL, { ssl, max: 5, idle_timeout: 20 })
    : postgres({
        host: required("DB_HOST"),
        port: Number(process.env.DB_PORT ?? 5432),
        database: required("DB_NAME"),
        username: required("DB_USER"),
        password: required("DB_PASSWORD"),
        ssl,
        max: 5,
        idle_timeout: 20,
      });
  return client;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
