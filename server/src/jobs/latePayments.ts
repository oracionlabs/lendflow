import { supabaseAdmin } from '../lib/supabase'
import { sendEmail, paymentDueEmail } from '../lib/email'
import { createNotification, notifyLoanStatusChange } from '../lib/notifications'

export async function runLatePaymentJob() {
  const db = supabaseAdmin()
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // 1. Mark due installments (past due_date, still "upcoming")
  await db
    .from('loan_schedule')
    .update({ status: 'due' })
    .eq('status', 'upcoming')
    .lte('due_date', today)

  // 2. Get platform settings for grace period and default threshold
  const { data: settings } = await db
    .from('platform_settings')
    .select('grace_period_days, default_threshold_missed, late_fee_flat')
    .single()

  const gracePeriodDays = settings?.grace_period_days ?? 5
  const defaultThreshold = settings?.default_threshold_missed ?? 3
  const lateFeeFlat = settings?.late_fee_flat ?? 2500

  const graceCutoff = new Date(now)
  graceCutoff.setDate(graceCutoff.getDate() - gracePeriodDays)

  // 3. Find "due" installments past grace period -> mark late
  const { data: overdue } = await db
    .from('loan_schedule')
    .select('id, loan_id, due_date, total_due, installment_number')
    .eq('status', 'due')
    .lte('due_date', graceCutoff.toISOString().split('T')[0])

  for (const item of overdue ?? []) {
    const daysLate = Math.floor((now.getTime() - new Date(item.due_date).getTime()) / 86400000)
    await db.from('loan_schedule').update({ status: 'late', days_late: daysLate, late_fee: lateFeeFlat }).eq('id', item.id)
  }

  // 4. Find "late" installments that have been late 30+ days -> missed
  const missedCutoff = new Date(now)
  missedCutoff.setDate(missedCutoff.getDate() - 30)

  const { data: lateItems } = await db
    .from('loan_schedule')
    .select('id, loan_id, due_date, installment_number')
    .eq('status', 'late')
    .lte('due_date', missedCutoff.toISOString().split('T')[0])

  for (const item of lateItems ?? []) {
    const daysLate = Math.floor((now.getTime() - new Date(item.due_date).getTime()) / 86400000)
    await db.from('loan_schedule').update({ status: 'missed', days_late: daysLate }).eq('id', item.id)
  }

  // 5. Detect defaults: N consecutive missed payments
  const { data: activeLoans } = await db
    .from('loans')
    .select('id, borrower_id, purpose')
    .in('status', ['active', 'repaying'])

  for (const loan of activeLoans ?? []) {
    const { data: schedule } = await db
      .from('loan_schedule')
      .select('status, installment_number')
      .eq('loan_id', loan.id)
      .order('installment_number', { ascending: true })

    if (!schedule?.length) continue

    let consecutiveMissed = 0
    let maxConsecutive = 0
    for (const row of schedule) {
      if (row.status === 'missed') {
        consecutiveMissed++
        maxConsecutive = Math.max(maxConsecutive, consecutiveMissed)
      } else if (['upcoming', 'due', 'late'].includes(row.status)) {
        break
      } else {
        consecutiveMissed = 0
      }
    }

    if (maxConsecutive >= defaultThreshold) {
      await db.from('loans').update({ status: 'defaulted' }).eq('id', loan.id)
      await db.from('funding_commitments')
        .update({ status: 'non_performing' })
        .eq('loan_id', loan.id)

      const { data: borrower } = await db
        .from('users')
        .select('name, email')
        .eq('id', loan.borrower_id)
        .single()

      if (borrower) {
        await createNotification({
          user_id: loan.borrower_id,
          type: 'loan_non_performing',
          title: 'Loan marked as defaulted',
          body: `Your ${loan.purpose.replace('_', ' ')} loan has been marked as defaulted after ${maxConsecutive} consecutive missed payments.`,
          link: `/borrower/loans/${loan.id}`,
        })

        await sendEmail(
          borrower.email,
          'Your loan has been marked as defaulted',
          `<p>Hi ${borrower.name},</p><p>Your loan has been marked as defaulted after ${maxConsecutive} consecutive missed payments. Please contact support immediately.</p>`
        )
      }

      // Notify lenders
      const { data: commitments } = await db
        .from('funding_commitments')
        .select('lender_id')
        .eq('loan_id', loan.id)

      for (const c of commitments ?? []) {
        await createNotification({
          user_id: c.lender_id,
          type: 'loan_non_performing',
          title: 'Loan entered non-performing status',
          body: `A loan in your portfolio (${loan.purpose.replace('_', ' ')}) has been marked as non-performing.`,
          link: `/lender/portfolio`,
        })
      }
    }
  }

  // 6. Send payment due reminders (3 days before due date)
  const reminderDate = new Date(now)
  reminderDate.setDate(reminderDate.getDate() + 3)
  const reminderDateStr = reminderDate.toISOString().split('T')[0]

  const { data: upcoming } = await db
    .from('loan_schedule')
    .select('id, loan_id, due_date, total_due, installment_number')
    .eq('status', 'upcoming')
    .eq('due_date', reminderDateStr)

  for (const item of upcoming ?? []) {
    const { data: loan } = await db
      .from('loans')
      .select('borrower_id, purpose')
      .eq('id', item.loan_id)
      .single()

    if (!loan) continue

    const { data: borrower } = await db
      .from('users')
      .select('name, email')
      .eq('id', loan.borrower_id)
      .single()

    if (!borrower) continue

    const { data: prefs } = await db
      .from('notification_preferences')
      .select('payment_due_in_app, payment_due_email')
      .eq('user_id', loan.borrower_id)
      .single()

    if (prefs?.payment_due_in_app !== false) {
      await createNotification({
        user_id: loan.borrower_id,
        type: 'payment_due',
        title: 'Payment due in 3 days',
        body: `Installment #${item.installment_number} of $${(item.total_due / 100).toFixed(2)} is due on ${item.due_date}.`,
        link: `/borrower/loans/${item.loan_id}`,
      })
    }

    if (prefs?.payment_due_email !== false) {
      await sendEmail(
        borrower.email,
        'Payment reminder — due in 3 days',
        paymentDueEmail(borrower.name, item.total_due, item.due_date)
      ).catch(() => null) // don't crash job on email failure
    }
  }

  console.log(`[latePayments] job complete at ${now.toISOString()}`)
}
