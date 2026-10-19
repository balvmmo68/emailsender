import { randomUUID } from "crypto";
import { db, ensureDatabase } from "@/db/client";
import { providerErrorLogs } from "@/db/schema";

export async function recordProviderError(providerEnv: string, operation: string, error: unknown, recipient?: string) {
  const errorMessage = error instanceof Error ? error.message : String(error || "Lỗi không xác định");
  console.error(`[provider-error] ${providerEnv} ${operation}: ${errorMessage}`);
  await ensureDatabase();
  await db.insert(providerErrorLogs).values({ id: randomUUID(), providerEnv, operation, recipient: recipient || null, errorMessage, createdAt: Date.now() });
}
