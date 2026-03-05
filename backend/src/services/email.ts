import nodemailer from 'nodemailer'

function createTransporter() {
  return nodemailer.createTransport({
    host:              process.env.SMTP_HOST || 'smtp.gmail.com',
    port:              parseInt(process.env.SMTP_PORT || '587'),
    secure:            process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10s to establish TCP connection
    greetingTimeout:   10000, // 10s to receive SMTP greeting
    socketTimeout:     15000, // 15s idle socket before giving up
  })
}

const FROM = () =>
  `"AFL Ladder Predictor" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aflladder.com'}>`

/** Send a password-reset email with a one-hour expiry link. */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP not configured — skipping password reset email')
    console.info(`[Email] Reset URL would have been: ${resetUrl}`)
    return
  }
  const transporter = createTransporter()
  await transporter.sendMail({
    from:    FROM(),
    to:      email,
    subject: 'Reset your password — AFL Ladder Predictor',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <div style="background:#0f172a;padding:24px 32px;">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;background:#10b981;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-weight:900;font-size:11px;letter-spacing:-0.5px;">AFL</span>
            </div>
            <span style="color:#fff;font-weight:700;font-size:16px;">Ladder Predictor</span>
          </div>
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:800;">Reset your password</h2>
          <p style="color:#64748b;margin:0 0 24px;line-height:1.6;">
            We received a request to reset the password for your account. Click the button below — this link expires in <strong>1 hour</strong>.
          </p>
          <a href="${resetUrl}"
            style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">
            Reset Password
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:28px;line-height:1.6;">
            If you didn't request a password reset, you can safely ignore this email — your password won't change.
            <br><br>
            If the button above doesn't work, copy and paste this URL into your browser:<br>
            <span style="color:#10b981;word-break:break-all;">${resetUrl}</span>
          </p>
        </div>
      </div>
    `,
  })
  console.log(`[Email] Password reset email sent to ${email}`)
}

/** Generic utility to send any plain-text email (for future round recaps etc.) */
export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP not configured — email not sent')
    return
  }
  const transporter = createTransporter()
  await transporter.sendMail({ from: FROM(), ...opts })
}
