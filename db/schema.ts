import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull().default(""),
  textContent: text("text_content").notNull().default(""),
  recipientCount: integer("recipient_count").notNull().default(0),
  sendStatus: text("send_status").notNull().default("draft"),
  sendCursor: integer("send_cursor").notNull().default(0),
  sendError: text("send_error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const recipients = sqliteTable("recipients", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  variablesJson: text("variables_json").notNull().default("{}"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
});

export const emailSettings = sqliteTable("email_settings", {
  id: integer("id").primaryKey(),
  delaySeconds: integer("delay_seconds").notNull().default(10),
  dailyLimit: integer("daily_limit").notNull().default(100),
  providerLimitsJson: text("provider_limits_json").notNull().default("{}"),
  providerConfigsJson: text("provider_configs_json").notNull().default("{}"),
  testRecipient: text("test_recipient").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const providerUsage = sqliteTable("provider_usage", {
  providerEnv: text("provider_env").notNull(),
  usageDate: text("usage_date").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
}, (table) => ({
  providerUsagePk: primaryKey({ columns: [table.providerEnv, table.usageDate] }),
}));

export const providerErrorLogs = sqliteTable("provider_error_logs", {
  id: text("id").primaryKey(),
  providerEnv: text("provider_env").notNull(),
  operation: text("operation").notNull(),
  recipient: text("recipient"),
  errorMessage: text("error_message").notNull(),
  createdAt: integer("created_at").notNull(),
});
