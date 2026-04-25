import { supabaseAdmin } from './supabase'
import { sendEmail, loanStatusEmail, paymentDueEmail, yieldReceivedEmail } from './email'
import type { NotificationType } from '@lendflow/shared'

interface NotifyParams {
  user_id: string
  type: NotificationType
  title: string
  body?: string
  link?: string
}

export async function createNotification(params: NotifyParams): Promise<void> {
  const db = supabaseAdmin()
  await db.from('notifications').insert({
    user_id: params.user_id,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
    channel: 'both',
  })
}

export async function notifyLoanStatusChange(
  userId: string,
  userName: string,
  userEmail: string,
  loanId: string,
  status: string,
  reason?: string
): Promise<void> {
  await createNotification({
    user_id: userId,
    type: 'loan_status',
    title: `Loan application ${status}`,
    body: reason ? `Reason: ${reason}` : undefined,
    link: `/borrower/loans/${loanId}`,
  })

  await sendEmail(
    userEmail,
    `LendFlow: Your loan application has been ${status}`,
    loanStatusEmail(userName, status, reason)
  )
}

export async function notifyPaymentDue(
  userId: string,
  userName: string,
  userEmail: string,
  loanId: string,
  amount: number,
  dueDate: string
): Promise<void> {
  await createNotification({
    user_id: userId,
    type: 'payment_due',
    title: 'Payment due soon',
    body: `Your next payment is due on ${dueDate}`,
    link: `/borrower/loans/${loanId}`,
  })

  await sendEmail(
    userEmail,
    'LendFlow: Payment due reminder',
    paymentDueEmail(userName, amount, dueDate)
  )
}

export async function notifyYieldReceived(
  lenderId: string,
  lenderName: string,
  lenderEmail: string,
  commitmentId: string,
  amount: number,
  purpose: string
): Promise<void> {
  await createNotification({
    user_id: lenderId,
    type: 'yield_received',
    title: `You received a payment`,
    body: `Yield distribution from ${purpose} loan`,
    link: `/lender/commitments/${commitmentId}`,
  })

  await sendEmail(
    lenderEmail,
    'LendFlow: Yield received',
    yieldReceivedEmail(lenderName, amount, purpose)
  )
}
