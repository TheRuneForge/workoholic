import type { EmailBinding } from "../apps/web/src/notifier";

export interface SmtpEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
}

export function smtpBinding(env: SmtpEnv): EmailBinding;
