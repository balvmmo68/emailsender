import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let schemaPromise: Promise<void> | undefined;

/** Creates the MVP tables on first use when the deployment database is empty. */
export function ensureDatabase() {
  if (!schemaPromise) {
    schemaPromise = Promise.all([
      client.execute(`CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        html_content TEXT NOT NULL DEFAULT '',
        text_content TEXT NOT NULL DEFAULT '',
        recipient_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      client.execute(`CREATE TABLE IF NOT EXISTS recipients (
        id TEXT PRIMARY KEY NOT NULL,
        campaign_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        variables_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
      )`),
      client.execute("CREATE INDEX IF NOT EXISTS recipients_campaign_idx ON recipients(campaign_id)"),
    ])
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = undefined;
        throw error;
      });
  }
  return schemaPromise;
}

export const db = drizzle(client, { schema });
