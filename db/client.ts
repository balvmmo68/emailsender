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
    schemaPromise = (async () => {
      await client.execute(`CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        html_content TEXT NOT NULL DEFAULT '',
        text_content TEXT NOT NULL DEFAULT '',
        recipient_count INTEGER NOT NULL DEFAULT 0,
        send_status TEXT NOT NULL DEFAULT 'draft',
        send_cursor INTEGER NOT NULL DEFAULT 0,
        send_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      await client.execute(`CREATE TABLE IF NOT EXISTS recipients (
        id TEXT PRIMARY KEY NOT NULL,
        campaign_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        variables_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
      )`);
      await client.execute("CREATE INDEX IF NOT EXISTS recipients_campaign_idx ON recipients(campaign_id)");
      await client.execute(`CREATE TABLE IF NOT EXISTS email_lists (
        id TEXT PRIMARY KEY NOT NULL,
        subject TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      await client.execute(`CREATE TABLE IF NOT EXISTS email_list_contacts (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        created_at INTEGER NOT NULL
      )`);
      await client.execute("CREATE INDEX IF NOT EXISTS email_list_contacts_list_idx ON email_list_contacts(list_id)");
      await client.execute("CREATE INDEX IF NOT EXISTS email_list_contacts_email_idx ON email_list_contacts(email)");
      for (const statement of [
        "ALTER TABLE campaigns ADD COLUMN send_status TEXT NOT NULL DEFAULT 'draft'",
        "ALTER TABLE campaigns ADD COLUMN send_cursor INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE campaigns ADD COLUMN send_error TEXT",
      ]) {
        try { await client.execute(statement); } catch { /* Column already exists. */ }
      }
      await client.execute(`CREATE TABLE IF NOT EXISTS email_settings (
        id INTEGER PRIMARY KEY NOT NULL,
        delay_seconds INTEGER NOT NULL DEFAULT 10,
        daily_limit INTEGER NOT NULL DEFAULT 100,
        provider_limits_json TEXT NOT NULL DEFAULT '{}',
        provider_configs_json TEXT NOT NULL DEFAULT '{}',
        test_recipient TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      )`);
      try {
        await client.execute("ALTER TABLE email_settings ADD COLUMN provider_limits_json TEXT NOT NULL DEFAULT '{}'");
      } catch {
        // Column already exists on databases initialized with the latest schema.
      }
      try {
        await client.execute("ALTER TABLE email_settings ADD COLUMN provider_configs_json TEXT NOT NULL DEFAULT '{}'");
      } catch {
        // Column already exists on databases initialized with the latest schema.
      }
      try {
        await client.execute("ALTER TABLE email_settings ADD COLUMN test_recipient TEXT NOT NULL DEFAULT ''");
      } catch {
        // Column already exists on databases initialized with the latest schema.
      }
      await client.execute(`CREATE TABLE IF NOT EXISTS provider_usage (
        provider_env TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        sent_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (provider_env, usage_date)
      )`);
      await client.execute(`CREATE TABLE IF NOT EXISTS provider_error_logs (
        id TEXT PRIMARY KEY NOT NULL,
        provider_env TEXT NOT NULL,
        operation TEXT NOT NULL,
        recipient TEXT,
        error_message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      await client.execute("CREATE INDEX IF NOT EXISTS provider_error_logs_created_idx ON provider_error_logs(created_at)");
      await client.execute(`INSERT OR IGNORE INTO email_settings (id, delay_seconds, daily_limit, updated_at)
        VALUES (1, 10, 100, ${Date.now()})`);
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export const db = drizzle(client, { schema });
