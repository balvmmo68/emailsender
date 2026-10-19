type ProviderLimit = { name: string; env: string; requiredVariables?: string[] };

const SEND_PROVIDERS: ProviderLimit[] = [
  { name: "Resend", env: "RESEND_API_KEY" },
  { name: "Brevo", env: "BREVO_API_KEY" },
  { name: "Mailjet", env: "MAILJET_API_KEY", requiredVariables: ["MAILJET_SECRET_KEY"] },
  { name: "Mailtrap", env: "MAILTRAP_API_TOKEN" },
  { name: "Mailgun", env: "MAILGUN_API_KEY", requiredVariables: ["MAILGUN_DOMAIN"] },
  { name: "Postmark", env: "POSTMARK_SERVER_TOKEN" },
  { name: "MailerSend", env: "MAILERSEND_API_TOKEN" },
  { name: "SMTP2GO", env: "SMTP2GO_API_KEY" },
  { name: "Mailofly", env: "MAILOFLY_API_KEY" },
  { name: "AgentMail", env: "AGENTMAIL_API_KEY" },
];

type ProviderConfig = { dailyLimit?: number };

export function getConfiguredProviderDailyCapacity(providerConfigsJson?: string | null) {
  let configs: Record<string, ProviderConfig> = {};
  try {
    const parsed: unknown = JSON.parse(providerConfigsJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) configs = parsed as Record<string, ProviderConfig>;
  } catch {
    // Use the same 100-email default as the settings API when configuration JSON is absent or invalid.
  }

  const providers = SEND_PROVIDERS.flatMap((provider) => {
    const required = [provider.env, ...(provider.requiredVariables || [])];
    if (!required.every((variable) => Boolean(process.env[variable]))) return [];
    const configuredLimit = Number(configs[provider.env]?.dailyLimit);
    const dailyLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 100;
    return [{ name: provider.name, dailyLimit }];
  });

  return { total: providers.reduce((sum, provider) => sum + provider.dailyLimit, 0), providers };
}
