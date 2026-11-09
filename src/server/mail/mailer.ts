import nodemailer from "nodemailer";
import { env } from "@/server/env";

// FR-1.1 verification e-mails. With no SMTP_URL (development) the message is
// printed to the server console so the link can be clicked from the terminal.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const { SMTP_URL, MAIL_FROM } = env();
  if (!SMTP_URL) {
    // Visible in the hosting logs too: a deployment without SMTP settings never sends real mail.
    if (env().NODE_ENV === "production") console.warn("[mail] SMTP_URL is not set: e-mail printed, not sent");
    console.info(
      [
        "",
        "──────── 📧 DEV MAIL (not sent) ────────",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }
  await nodemailer.createTransport(SMTP_URL).sendMail({ from: MAIL_FROM, ...message });
}
