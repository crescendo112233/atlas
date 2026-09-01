import postgres from "postgres";

export function createSql() {
  const ssl = process.env.DB_SSL === "true" ? "require" : false;
  if (process.env.DATABASE_URL) return postgres(process.env.DATABASE_URL, { ssl, max: 2 });
  return postgres({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT ?? 5432),
    database: required("DB_NAME"),
    username: required("DB_USER"),
    password: required("DB_PASSWORD"),
    ssl,
    max: 2,
  });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
