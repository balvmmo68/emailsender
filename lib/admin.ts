export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "balv.airdrop@gmail.com").trim().toLowerCase();

export function isAdminEmail(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}
