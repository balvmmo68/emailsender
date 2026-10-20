export type ProviderMessage = { to: string; subject: string; html: string; text: string };

function fromAddress() {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

function fromEmail() {
  const value = fromAddress().trim();
  const match = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const email = (match?.[1] || value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("EMAIL_FROM phải là email hợp lệ, ví dụ sender@your-domain.com");
  return email;
}

async function readResponse(response: Response) {
  const rawBody = await response.text();
  let body: any = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = { message: rawBody }; }
  if (!response.ok) {
    const validationErrors = body?.errors && !Array.isArray(body.errors) ? Object.entries(body.errors).flatMap(([field, errors]) => (Array.isArray(errors) ? errors : [errors]).map((detail) => `${field}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`)).join("; ") : body?.errors?.map((item: any) => item?.message || item?.detail || String(item)).filter(Boolean).join("; ");
    const message = body?.ErrorMessage || body?.message || body?.error || validationErrors || body?.Messages?.flatMap((item: any) => item?.Errors || []).map((item: any) => item?.ErrorMessage || item?.Message).filter(Boolean).join("; ");
    const providerMessage = message || (rawBody && rawBody.length < 1000 ? rawBody : "");
    throw new Error(providerMessage ? `${providerMessage} (HTTP ${response.status})` : `Provider trả về HTTP ${response.status}`);
  }
  return body;
}

export const supportedProviderEnvs = ["RESEND_API_KEY", "BREVO_API_KEY", "MAILJET_API_KEY", "MAILTRAP_API_TOKEN", "MAILGUN_API_KEY", "POSTMARK_SERVER_TOKEN", "MAILERSEND_API_TOKEN", "SMTP2GO_API_KEY", "MAILOFLY_API_KEY", "AGENTMAIL_API_KEY"] as const;

const requiredProviderVariables: Record<string, string[]> = {
  MAILJET_API_KEY: ["MAILJET_API_KEY", "MAILJET_SECRET_KEY"],
  MAILGUN_API_KEY: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
};

export function missingProviderEnvVariables(env: string) {
  return (requiredProviderVariables[env] || [env]).filter((variable) => !process.env[variable]);
}

export function isProviderConfigured(env: string) {
  return missingProviderEnvVariables(env).length === 0;
}

export function isProviderEnabled(configs: Record<string, { enabled?: boolean }>, env: string) {
  return configs[env]?.enabled !== false;
}

async function resolveAgentMailInboxId(key: string) {
  const configuredInbox = process.env.AGENTMAIL_INBOX_ID?.trim();
  const senderDomain = fromEmail().split("@").pop()?.toLowerCase();
  if (configuredInbox) {
    const inbox = await readResponse(await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(configuredInbox)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    }));
    const inboxDomain = typeof inbox.email === "string" ? inbox.email.split("@").pop()?.toLowerCase() : undefined;
    if (senderDomain && inboxDomain !== senderDomain) {
      throw new Error(`AGENTMAIL_CONFIG: Inbox ${configuredInbox} không thuộc domain ${senderDomain}. Hãy đặt AGENTMAIL_INBOX_ID thành inbox đã tạo trên domain đã verify.`);
    }
    return configuredInbox;
  }
  const result = await readResponse(await fetch("https://api.agentmail.to/v0/inboxes?limit=100", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }));
  const inbox = result.inboxes?.find((candidate: { email?: string }) => typeof candidate.email === "string" && candidate.email.split("@").pop()?.toLowerCase() === senderDomain);
  if (!inbox?.inbox_id) {
    throw new Error(`AGENTMAIL_CONFIG: Không tìm thấy inbox AgentMail trên domain ${senderDomain}. Hãy verify domain, tạo inbox trên domain đó, rồi đặt AGENTMAIL_INBOX_ID trong Vercel.`);
  }
  return inbox.inbox_id as string;
}

export async function sendViaProvider(env: string, message: ProviderMessage) {
  const key = process.env[env];
  if (!key) throw new Error(`Thiếu ${env}`);
  const from = fromAddress();
  const email = fromEmail();
  if (env === "RESEND_API_KEY") {
    const body = await readResponse(await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }) }));
    return body.id as string | undefined;
  }
  if (env === "BREVO_API_KEY") {
    const body = await readResponse(await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ sender: { email }, to: [{ email: message.to }], subject: message.subject, htmlContent: message.html, textContent: message.text }) }));
    return body.messageId as string | undefined;
  }
  if (env === "MAILJET_API_KEY") {
    const secret = process.env.MAILJET_SECRET_KEY;
    if (!secret) throw new Error("Thiếu MAILJET_SECRET_KEY");
    const authorization = Buffer.from(`${key}:${secret}`).toString("base64");
    const senderName = from.match(/^([^<]+)</)?.[1]?.trim();
    const body = await readResponse(await fetch("https://api.mailjet.com/v3.1/send", { method: "POST", headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" }, body: JSON.stringify({ Messages: [{ From: { Email: email, ...(senderName ? { Name: senderName } : {}) }, To: [{ Email: message.to }], Subject: message.subject, HTMLPart: message.html, TextPart: message.text }] }) }));
    return body.Messages?.[0]?.To?.[0]?.MessageID?.toString();
  }
  if (env === "MAILTRAP_API_TOKEN") {
    const senderName = from.match(/^([^<]+)</)?.[1]?.trim();
    const body = await readResponse(await fetch("https://send.api.mailtrap.io/api/send", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: { email, ...(senderName ? { name: senderName } : {}) }, to: [{ email: message.to }], subject: message.subject, text: message.text, html: message.html }) }));
    return body.message_ids?.[0] || body.message_id || body.id;
  }
  if (env === "MAILOFLY_API_KEY") {
    const body = await readResponse(await fetch("https://api.mailofly.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }) }));
    return body.id as string | undefined;
  }
  if (env === "AGENTMAIL_API_KEY") {
    let inboxId: string;
    try {
      inboxId = await resolveAgentMailInboxId(key);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`AGENTMAIL_PRE_SEND: ${detail}`);
    }
    const body = await readResponse(await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ to: message.to, subject: message.subject, text: message.text, html: message.html }) }));
    return body.message_id || body.id;
  }
  if (env === "POSTMARK_SERVER_TOKEN") {
    const body = await readResponse(await fetch("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": key, "Content-Type": "application/json" }, body: JSON.stringify({ From: from, To: message.to, Subject: message.subject, HtmlBody: message.html, TextBody: message.text, MessageStream: "outbound" }) }));
    return body.MessageID as string | undefined;
  }
  if (env === "MAILERSEND_API_TOKEN") {
    const response = await fetch("https://api.mailersend.com/v1/email", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: { email }, to: [{ email: message.to }], subject: message.subject, html: message.html, text: message.text }) });
    await readResponse(response);
    return response.headers.get("x-message-id") || undefined;
  }
  if (env === "MAILGUN_API_KEY") {
    const domain = process.env.MAILGUN_DOMAIN;
    if (!domain) throw new Error("Thiếu MAILGUN_DOMAIN");
    const form = new URLSearchParams({ from, to: message.to, subject: message.subject, html: message.html, text: message.text });
    const basic = Buffer.from(`api:${key}`).toString("base64");
    const body = await readResponse(await fetch(`https://api.mailgun.net/v3/${domain}/messages`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form }));
    return body.id as string | undefined;
  }
  if (env === "SMTP2GO_API_KEY") {
    const body = await readResponse(await fetch("https://api.smtp2go.com/v3/email/send", { method: "POST", headers: { "X-Smtp2go-Api-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ sender: email, to: [message.to], subject: message.subject, html_body: message.html, text_body: message.text }) }));
    return body?.request_id as string | undefined;
  }
  throw new Error(`Chưa có adapter gửi cho ${env}`);
}

export async function testProvider(env: string) {
  const key = process.env[env];
  if (!key) throw new Error(`Chưa cấu hình ${env}`);
  if (env === "RESEND_API_KEY") return readResponse(await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }));
  if (env === "BREVO_API_KEY") return readResponse(await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key } }));
  if (env === "MAILJET_API_KEY") {
    const secret = process.env.MAILJET_SECRET_KEY;
    if (!secret) throw new Error("Thiếu MAILJET_SECRET_KEY");
    const authorization = Buffer.from(`${key}:${secret}`).toString("base64");
    return readResponse(await fetch("https://api.mailjet.com/v3/REST/myprofile", { headers: { Authorization: `Basic ${authorization}` } }));
  }
  if (env === "MAILTRAP_API_TOKEN") return readResponse(await fetch("https://mailtrap.io/api/accounts", { headers: { Authorization: `Bearer ${key}` } }));
  if (env === "MAILOFLY_API_KEY") return readResponse(await fetch("https://api.mailofly.com/identities", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }));
  if (env === "AGENTMAIL_API_KEY") return readResponse(await fetch("https://api.agentmail.to/v0/inboxes?limit=1", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }));
  if (env === "POSTMARK_SERVER_TOKEN") return readResponse(await fetch("https://api.postmarkapp.com/server", { headers: { "X-Postmark-Server-Token": key } }));
  if (env === "MAILERSEND_API_TOKEN") return readResponse(await fetch("https://api.mailersend.com/v1/domains", { headers: { Authorization: `Bearer ${key}` } }));
  if (env === "SMTP2GO_API_KEY") return readResponse(await fetch("https://api.smtp2go.com/v3/stats/email", { headers: { "X-Smtp2go-Api-Key": key } }));
  if (env === "MAILGUN_API_KEY") {
    const domain = process.env.MAILGUN_DOMAIN;
    if (!domain) throw new Error("Thiếu MAILGUN_DOMAIN");
    const basic = Buffer.from(`api:${key}`).toString("base64");
    return readResponse(await fetch(`https://api.mailgun.net/v3/${domain}`, { headers: { Authorization: `Basic ${basic}` } }));
  }
  throw new Error(`Chưa có health-check adapter cho ${env}`);
}
