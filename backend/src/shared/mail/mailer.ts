import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: (process.env.SMTP_SECURE ?? "false") === "true",
  auth: (process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined),
});

export async function sendOtpEmail(to: string, otp: string) {
  const from = process.env.MAIL_FROM ?? "Elookup <no-reply@elookup.local>";
  const subject = "Your Elookup OTP Code";
  const text = `Your OTP is ${otp}. It expires in 10 minutes. If you did not request this, ignore.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px">
      <h2 style="margin:0 0 10px 0;color:#0f172a">Elookup Verification Code</h2>
      <p style="color:#334155">Use this OTP to continue:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:12px 16px;border-radius:12px;background:#0ea5e9;color:#fff;display:inline-block">${otp}</div>
      <p style="color:#64748b;margin-top:14px">Expires in <b>10 minutes</b>.</p>
    </div>`;
  await transporter.sendMail({ from, to, subject, text, html });
}
