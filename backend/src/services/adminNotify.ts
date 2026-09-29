import { sendEmail } from './email'

// Operational alerts for the site admin (season rollover, sync failures,
// unknown team names). Emails go to ADMIN_EMAIL when set; everything is also
// logged so the behaviour is visible without SMTP. In-memory dedup keeps a
// repeating condition from spamming — pass a fresh key to re-notify.
const sentKeys = new Set<string>()

export async function notifyAdmin(
  key: string,
  subject: string,
  lines: string[],
  opts: { once?: boolean } = { once: true }
): Promise<void> {
  const body = lines.join('\n')
  console.log(`[AdminNotify] ${subject}\n${body}`)

  if (opts.once !== false) {
    if (sentKeys.has(key)) return
    sentKeys.add(key)
  }

  const to = process.env.ADMIN_EMAIL
  if (!to) return

  try {
    await sendEmail({
      to,
      subject: `[AFL Ladder] ${subject}`,
      html: `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(body)}</pre>`,
    })
  } catch (error: any) {
    console.error('[AdminNotify] Failed to send email:', error.message)
  }
}

/** Allow a condition to notify again (e.g. after it recovers and recurs). */
export function resetAdminNotify(key: string): void {
  sentKeys.delete(key)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
