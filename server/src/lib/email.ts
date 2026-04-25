import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM = process.env.RESEND_FROM || 'noreply@lendflow.app'

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] Would send to ${to}: ${subject}`)
    return
  }
  try {
    await getResend().emails.send({ from: FROM, to, subject, html })
  } catch (err) {
    console.error('[email] Failed to send:', err)
  }
}

export function loanStatusEmail(name: string, status: string, reason?: string): string {
  return `<p>Hi ${name},</p><p>Your loan application status has been updated to: <strong>${status}</strong>.</p>${reason ? `<p>Reason: ${reason}</p>` : ''}<p>Log in to LendFlow to view details.</p>`
}

export function paymentDueEmail(name: string, amount: number, dueDate: string): string {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
  return `<p>Hi ${name},</p><p>Your next payment of <strong>${fmt.format(amount / 100)}</strong> is due on <strong>${dueDate}</strong>.</p><p>Log in to LendFlow to make your payment.</p>`
}

export function yieldReceivedEmail(name: string, amount: number, purpose: string): string {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
  return `<p>Hi ${name},</p><p>You received <strong>${fmt.format(amount / 100)}</strong> from a ${purpose} loan.</p><p>Log in to LendFlow to view your portfolio.</p>`
}
