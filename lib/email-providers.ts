export type ProviderMessage = { to: string; subject: string; html: string; text: string };

function fromAddress() {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.error || `Provider trả về HTTP ${response.status}`);
  return body;
}

export const supportedProviderEnvs = ["RESEND_API_KEY", "BREVO_API_KEY", "MAILGUN_API_KEY", "POSTMARK_SERVER_TOKEN", "MAILERSEND_API_TOKEN", "SMTP2GO_API_KEY"];

export async function sendViaProvider(env: string, message: ProviderMessage) {
  const key = process.env[env];
  if (!key) throw new Error(`Thiếu ${env}`);
  const from = fromAddress();
  if (env === "RESEND_API_KEY") {
    const body = await readResponse(await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }) }));
    return body.id as string | undefined;
  }
  if (env === "BREVO_API_KEY") {
    const body = await readResponse(await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ sender: { email: from }, to: [{ email: message.to }], subject: message.subject, htmlContent: message.html, textContent: message.text }) }));
    return body.messageId as string | undefined;
  }
  if (env === "POSTMARK_SERVER_TOKEN") {
    const body = await readResponse(await fetch("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": key, "Content-Type": "application/json" }, body: JSON.stringify({ From: from, To: message.to, Subject: message.subject, HtmlBody: message.html, TextBody: message.text, MessageStream: "outbound" }) }));
    return body.MessageID as string | undefined;
  }
  if (env === "MAILERSEND_API_TOKEN") {
    const body = await fetch("https://api.mailersend.com/v1/email", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: { email: from }, to: [{ email: message.to }], subject: message.subject, html: message.html, text: message.text }) });
    if (!body.ok) throw new Error(`MailerSend trả về HTTP ${body.status}`);
    return body.headers.get("x-message-id") || undefined;
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
    const body = await readResponse(await fetch("https://api.smtp2go.com/v3/email/send", { method: "POST", headers: { "X-Smtp2go-Api-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ sender: from, to: [message.to], subject: message.subject, html_body: message.html, text_body: message.text }) }));
    return body?.request_id as string | undefined;
  }
  throw new Error(`Chưa có adapter gửi cho ${env}`);
}

export async function testProvider(env: string) {
  const key = process.env[env];
  if (!key) throw new Error(`Chưa cấu hình ${env}`);
  if (env === "RESEND_API_KEY") return readResponse(await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }));
  if (env === "BREVO_API_KEY") return readResponse(await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key } }));
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
