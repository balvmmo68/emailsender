import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull().default(""),
  textContent: text("text_content").notNull().default(""),
  recipientCount: integer("recipient_count").notNull().default(0),
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
  updatedAt: integer("updated_at").notNull(),
});
