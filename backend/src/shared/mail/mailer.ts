import nodemailer from "nodemailer";
import { logWarn } from "../observability/logger.js";

const SMTP_VERIFY_RETRY_MS = Math.max(5_000, Number(process.env.SMTP_VERIFY_RETRY_MS ?? 30_000));
const SMTP_VERIFY_TIMEOUT_MS = Math.max(3_000, Number(process.env.SMTP_VERIFY_TIMEOUT_MS ?? 10_000));
const SMTP_TEST_CONNECTION = (process.env.SMTP_TEST_CONNECTION ?? "true") !== "false";

function resolveSmtpPort() {
  const raw = Number(process.env.SMTP_PORT ?? 587);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 587;
}

function resolveSmtpHost() {
  return (process.env.SMTP_HOST ?? "").trim();
}

function resolveSmtpAuth() {
  const user = (process.env.SMTP_USER ?? "").trim();
  if (!user) return undefined;
  return { user, pass: process.env.SMTP_PASS };
}

export const transporter = nodemailer.createTransport({
  host: resolveSmtpHost() || undefined,
  port: resolveSmtpPort(),
  secure: (process.env.SMTP_SECURE ?? "false") === "true",
  auth: resolveSmtpAuth(),
});

let smtpStatusCache: { ready: boolean; checkedAt: number } | null = null;
let smtpVerifyInFlight: Promise<boolean> | null = null;

function isProduction() {
  return (process.env.NODE_ENV ?? "development") === "production";
}

function resolveMailFrom() {
  return process.env.MAIL_FROM ?? "Trace Verisys <no-reply@traceverisys.local>";
}

function resolveSupportRecipients() {
  const fromEnv = (process.env.SUPPORT_ADMIN_EMAILS ?? process.env.CONTACT_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(fromEnv));
}

async function ensureSmtpReady() {
  const host = resolveSmtpHost();
  if (!host) return false;
  if (!SMTP_TEST_CONNECTION) return true;

  const now = Date.now();
  if (smtpStatusCache && now - smtpStatusCache.checkedAt < SMTP_VERIFY_RETRY_MS) {
    return smtpStatusCache.ready;
  }

  if (!smtpVerifyInFlight) {
    smtpVerifyInFlight = Promise.race<boolean>([
      transporter.verify().then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), SMTP_VERIFY_TIMEOUT_MS);
      }),
    ])
      .catch((error) => {
        logWarn({
          scope: "mail",
          event: "smtp-verify-failed",
          host,
          port: resolveSmtpPort(),
          error,
        });
        return false;
      })
      .finally(() => {
        smtpVerifyInFlight = null;
      });
  }

  const ready = await smtpVerifyInFlight;
  smtpStatusCache = { ready, checkedAt: Date.now() };
  return ready;
}

async function sendWithFallback(payload: nodemailer.SendMailOptions & { devHint?: string }) {
  const ready = await ensureSmtpReady();
  if (ready) {
    await transporter.sendMail(payload);
    return;
  }

  if (!isProduction()) {
    if (payload.devHint) {
      // local/dev fallback so OTP and support workflows stay testable without SMTP credentials
      // eslint-disable-next-line no-console
      console.log(payload.devHint);
    }
    return;
  }

  const host = resolveSmtpHost();
  throw new Error(
    `SMTP transport is not configured or reachable. Check SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (host=${host || "missing"}).`
  );
}

export async function sendOtpEmail(to: string, otp: string, expirySeconds = 600) {
  const expiryMinutes = Math.max(1, Math.ceil(expirySeconds / 60));
  const from = resolveMailFrom();
  const subject = "Your Trace Verisys OTP Code";
  const text = `Your OTP is ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this, ignore.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px">
      <h2 style="margin:0 0 10px 0;color:#0f172a">Trace Verisys Verification Code</h2>
      <p style="color:#334155">Use this OTP to continue:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:12px 16px;border-radius:12px;background:#0ea5e9;color:#fff;display:inline-block">${otp}</div>
      <p style="color:#64748b;margin-top:14px">Expires in <b>${expiryMinutes} minutes</b>.</p>
    </div>`;

  await sendWithFallback({
    from,
    to,
    subject,
    text,
    html,
    devHint: `[DEV][OTP] ${to} => ${otp}`,
  });
}

export async function sendSupportTicketEmail(input: {
  ticketToken: string;
  subject: string;
  message: string;
  fromEmail?: string | null;
  fromName?: string | null;
  fromPhone?: string | null;
}) {
  const recipients = resolveSupportRecipients();
  if (!recipients.length) return;

  const from = resolveMailFrom();
  const senderLabel = [input.fromName, input.fromEmail].filter(Boolean).join(" <") + (input.fromEmail ? ">" : "");
  const safeSender = senderLabel.trim() || "Dashboard user";
  const safePhone = (input.fromPhone ?? "").trim();

  const text = [
    `Complaint Token: ${input.ticketToken}`,
    `Subject: ${input.subject}`,
    `Sender: ${safeSender}`,
    `Phone: ${safePhone || "Not provided"}`,
    "",
    input.message,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">
      <h2 style="margin:0;color:#0f172a">New Support Ticket</h2>
      <p style="color:#475569;margin:10px 0 0 0"><strong>Token:</strong> ${input.ticketToken}</p>
      <p style="color:#475569;margin:4px 0 0 0"><strong>Subject:</strong> ${input.subject}</p>
      <p style="color:#475569;margin:4px 0 12px 0"><strong>Sender:</strong> ${safeSender}</p>
      <p style="color:#475569;margin:4px 0 12px 0"><strong>Phone:</strong> ${safePhone || "Not provided"}</p>
      <div style="padding:12px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;white-space:pre-wrap">${input.message}</div>
    </div>`;

  await sendWithFallback({
    from,
    to: recipients,
    subject: `Trace Verisys Support • ${input.ticketToken} • ${input.subject}`,
    text,
    html,
    devHint: `[DEV][SUPPORT_MAIL] ${input.ticketToken} ${input.subject}`,
  });
}
