import "server-only";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

/**
 * Server-only Drizzle client. The `server-only` import makes the build fail if
 * a `"use client"` module ever imports this, keeping the DB off the browser.
 *
 * Local dev uses a file DB; set DATABASE_URL (e.g. a Turso libsql:// URL) to
 * point elsewhere without code changes.
 */
const url = process.env.DATABASE_URL ?? "file:./data/triageflow.db";

const libsql = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(libsql, { schema });
