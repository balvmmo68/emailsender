import { client, ensureDatabase } from "@/db/client";

/** Keep a 10% safety margin, but permit one send when the configured cap is 1. */
export function providerDailyAllowance(limit: unknown) {
  const parsed = Number(limit);
  const safeLimit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 100;
  return Math.max(1, Math.floor(safeLimit * 0.9));
}

export function hasProviderDailyCapacity(used: number, limit: unknown) {
  return used < providerDailyAllowance(limit);
}

/** Atomically reserve one slot before calling an external provider. */
export async function reserveProviderUsage(providerEnv: string, usageDate: string, limit: unknown) {
  await ensureDatabase();
  const allowance = providerDailyAllowance(limit);
  const result = await client.execute({
    sql: `INSERT INTO provider_usage (provider_env, usage_date, sent_count) VALUES (?, ?, 1)
      ON CONFLICT (provider_env, usage_date) DO UPDATE SET sent_count = sent_count + 1
      WHERE sent_count < ?`,
    args: [providerEnv, usageDate, allowance],
  });
  return result.rowsAffected === 1;
}

/** Only a definite provider 4xx response is safe to fail over/retry automatically. */
export function isDefinitiveProviderRejection(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = error.message.match(/\(HTTP (\d{3})\)/)?.[1];
  if (status) return new Set([400, 401, 403, 404, 405, 410, 413, 415, 422]).has(Number(status));
  return error.message.startsWith("Thiếu ") || error.message.startsWith("EMAIL_FROM phải") || error.message.startsWith("Chưa có adapter");
}

/** Release a slot only when the provider returned a definite client-side rejection. */
export async function releaseRejectedProviderUsage(providerEnv: string, usageDate: string, error: unknown) {
  if (!isDefinitiveProviderRejection(error)) return;
  await client.execute({
    sql: `UPDATE provider_usage SET sent_count = CASE WHEN sent_count > 0 THEN sent_count - 1 ELSE 0 END
      WHERE provider_env = ? AND usage_date = ?`,
    args: [providerEnv, usageDate],
  });
}
