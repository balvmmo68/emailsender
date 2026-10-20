const DEFAULT_ADMIN_EMAILS = [
  "balv.airdrop@gmail.com",
  "richworld369.com@gmail.com",
];

function normalizeEmails(value?: string | null) {
  return (value || "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Explicit deployment config replaces the built-in fallback so old admins can be revoked.
const configuredAdmins = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL;
export const ADMIN_EMAILS = Array.from(new Set(
  configuredAdmins === undefined ? DEFAULT_ADMIN_EMAILS : normalizeEmails(configuredAdmins),
));

export function isAdminEmail(email?: string | null) {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}
