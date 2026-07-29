import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL ?? "file:./data/triageflow.db";

// Ensure the local ./data dir exists for the file DB.
if (url.startsWith("file:")) {
  try {
    mkdirSync("./data", { recursive: true });
  } catch {
    /* already exists */
  }
}

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client);

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
