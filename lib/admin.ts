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

// ADMIN_EMAIL vẫn được hỗ trợ để không làm hỏng deployment hiện tại.
export const ADMIN_EMAILS = Array.from(
  new Set([
    ...DEFAULT_ADMIN_EMAILS,
    ...normalizeEmails(process.env.ADMIN_EMAILS),
    ...normalizeEmails(process.env.ADMIN_EMAIL),
  ]),
);

export function isAdminEmail(email?: string | null) {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}
