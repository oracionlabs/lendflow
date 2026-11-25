import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { applyTodayInterest, quoteAdvance } from '@lendflow/shared'
import { planInterestRoll } from '../lib/roll-due'

function reduceScheduleInterest(
  rows: Array<{ interest_due: number; interest_paid?: number | null; total_due: number }>,
  savings: number,
): number {
  let left = Math.max(0, Math.round(savings))
  for (let i = rows.length - 1; i >= 0 && left > 0; i--) {
    const row = rows[i]
    const room = Math.max(0, row.interest_due - (row.interest_paid ?? 0))
    const cut = Math.min(room, left)
    row.interest_due -= cut
    row.total_due -= cut
    left -= cut
  }
  return Math.max(0, Math.round(savings)) - left
}

const router = Router()

router.get('/:loanId/payments', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('borrower_id')
    .eq('id', req.params.loanId)
    .single()

  if (!loan || loan.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' }); return
  }

  const { data, error } = await db
    .from('loan_schedule')
    .select('*')
    .eq('loan_id', req.params.loanId)
    .in('status', ['paid', 'partial', 'late'])
    .order('installment_number', { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ payments: data })
})

router.post('/:loanId/payments', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { schedule_id, amount, advance, interest_only, pay_in_full, due_date } = req.body as {
    schedule_id: string
    amount: number
    advance?: boolean
    interest_only?: boolean
    pay_in_full?: boolean
    due_date?: string
  }

  if (pay_in_full) {
    const db = supabaseAdmin()
    const { data: loan } = await db
      .from('loans')
      .select('borrower_id, status, payment_channel, interest_rate, total_repayment')
      .eq('id', req.params.loanId)
      .single()
    if (!loan || loan.borrower_id !== user.id) { res.status(404).json({ error: 'Loan not found' }); return }
    if (!['active', 'repaying'].includes(loan.status)) {
      res.status(400).json({ error: 'Loan is not in a payable state' }); return
    }
    if (loan.payment_channel === 'instapay') {
      res.status(400).json({ error: 'Ask your lender to record the full payment' }); return
    }
    const { data: schedule } = await db
      .from('loan_schedule')
      .select('*')
      .eq('loan_id', req.params.loanId)
      .order('installment_number', { ascending: true })
    const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status))
    const aligned = applyTodayInterest(open, Number(loan.interest_rate ?? 0))
    if (!aligned || aligned.quote.payment_today <= 0) { res.status(400).json({ error: 'This loan is already paid' }); return }
    const due = aligned.quote.payment_today
    const interestDelta = aligned.quote.interest_today - aligned.quote.scheduled_interest
    const { data: wallet } = await db.from('wallets').select('id, available_balance').eq('user_id', user.id).single()
    if (!wallet || wallet.available_balance < due) {
      res.status(400).json({ error: 'Insufficient wallet balance' }); return
    }
    for (const row of aligned.rows) {
      const before = open.find(item => item.id === row.id)
      if (!before || before.interest_due === row.interest_due) continue
      await db.from('loan_schedule').update({ interest_due: row.interest_due, total_due: row.total_due }).eq('id', row.id)
    }
    if (interestDelta !== 0) {
      await db.from('loans').update({ total_repayment: Math.max(0, (loan.total_repayment ?? 0) + interestDelta) }).eq('id', req.params.loanId)
    }
    const { error: debitError } = await db.from('wallets').update({
      available_balance: wallet.available_balance - due,
    }).eq('id', wallet.id)
    if (debitError) { res.status(500).json({ error: debitError.message }); return }
    await db.from('transactions').insert({
      user_id: user.id,
      wallet_id: wallet.id,
      type: 'repayment',
      amount: -due,
      balance_after: wallet.available_balance - due,
      related_loan_id: req.params.loanId,
      description: 'Paid in full',
    })
    let interestRecorded = 0
    for (const row of aligned.rows) {
      const owed = Math.max(0, row.total_due - (row.total_paid ?? 0))
      if (owed <= 0) continue
      const interestPortion = Math.min(Math.max(0, row.interest_due - (row.interest_paid ?? 0)), owed)
      const principalPortion = Math.min(Math.max(0, row.principal_due - (row.principal_paid ?? 0)), owed - interestPortion)
      await db.from('loan_schedule').update({
        status: 'paid',
        principal_paid: (row.principal_paid ?? 0) + principalPortion,
        interest_paid: (row.interest_paid ?? 0) + interestPortion,
        total_paid: (row.total_paid ?? 0) + interestPortion + principalPortion,
        paid_at: new Date().toISOString(),
        payment_note: 'Paid in full',
      }).eq('id', row.id)
      interestRecorded += interestPortion
    }
    const { data: commits } = await db.from('funding_commitments').select('id, lender_id, share_percent, actual_yield, expected_yield').eq('loan_id', req.params.loanId)
    for (const commit of commits ?? []) {
      const share = Math.round(due * Number(commit.share_percent ?? 100) / 100)
      const interestShare = Math.round(interestRecorded * Number(commit.share_percent ?? 100) / 100)
      const { data: lenderWallet } = await db.from('wallets').select('id, available_balance, total_yield_earned').eq('user_id', commit.lender_id).single()
      if (lenderWallet) {
        await db.from('wallets').update({
          available_balance: lenderWallet.available_balance + share,
          total_yield_earned: (lenderWallet.total_yield_earned ?? 0) + interestShare,
        }).eq('id', lenderWallet.id)
        await db.from('transactions').insert({
          user_id: commit.lender_id,
          wallet_id: lenderWallet.id,
          type: 'yield_distribution',
          amount: share,
          balance_after: lenderWallet.available_balance + share,
          related_loan_id: req.params.loanId,
          related_commitment_id: commit.id,
          description: 'Paid in full',
        })
      }
      await db.from('funding_commitments').update({
        actual_yield: (commit.actual_yield ?? 0) + interestShare,
        expected_yield: Math.max(0, (commit.expected_yield ?? 0) + Math.round(interestDelta * Number(commit.share_percent ?? 100) / 100)),
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', commit.id)
    }
    await db.from('loans').update({ status: 'completed' }).eq('id', req.params.loanId)
    res.json({ total_paid: due, pay_in_full: true })
    return
  }

  if (interest_only) {
    const db = supabaseAdmin()
    const { data: loan } = await db
      .from('loans')
      .select('borrower_id, status, payment_channel, interest_rate, total_repayment')
      .eq('id', req.params.loanId)
      .single()
    if (!loan || loan.borrower_id !== user.id) { res.status(404).json({ error: 'Loan not found' }); return }
    if (!['active', 'repaying'].includes(loan.status)) {
      res.status(400).json({ error: 'Loan is not in a payable state' }); return
    }
    if (loan.payment_channel === 'instapay') {
      res.status(400).json({ error: 'Ask your lender to record an interest-only payment' }); return
    }
    if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      res.status(400).json({ error: 'Choose a new due date' }); return
    }
    const { data: schedule } = await db
      .from('loan_schedule')
      .select('*')
      .eq('loan_id', req.params.loanId)
      .order('installment_number', { ascending: true })
    const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status))
    const aligned = applyTodayInterest(open, Number(loan.interest_rate ?? 0))
    if (!aligned || aligned.quote.interest_today <= 0) { res.status(400).json({ error: 'No interest is left on this loan' }); return }
    const interestLeft = aligned.quote.interest_today
    const interestDelta = aligned.quote.interest_today - aligned.quote.scheduled_interest
    for (const row of aligned.rows) {
      const before = open.find(item => item.id === row.id)
      if (!before || before.interest_due === row.interest_due) continue
      await db.from('loan_schedule').update({
        interest_due: row.interest_due,
        total_due: row.total_due,
      }).eq('id', row.id)
    }
    const { data: wallet } = await db.from('wallets').select('id, available_balance').eq('user_id', user.id).single()
    if (!wallet || wallet.available_balance < interestLeft) {
      res.status(400).json({ error: 'Insufficient wallet balance' }); return
    }
    const { error: debitError } = await db.from('wallets').update({
      available_balance: wallet.available_balance - interestLeft,
    }).eq('id', wallet.id)
    if (debitError) { res.status(500).json({ error: debitError.message }); return }
    await db.from('transactions').insert({
      user_id: user.id,
      wallet_id: wallet.id,
      type: 'repayment',
      amount: -interestLeft,
      balance_after: wallet.available_balance - interestLeft,
      related_loan_id: req.params.loanId,
      description: 'Interest payment',
    })
    const { data: commits } = await db
      .from('funding_commitments')
      .select('id, lender_id, share_percent, actual_yield, expected_yield')
      .eq('loan_id', req.params.loanId)
    for (const row of aligned.rows) {
      const interestOwed = Math.max(0, row.interest_due - (row.interest_paid ?? 0))
      if (interestOwed <= 0) continue
      const totalPaid = (row.total_paid ?? 0) + interestOwed
      await db.from('loan_schedule').update({
        status: totalPaid >= row.total_due ? 'paid' : 'partial',
        interest_paid: (row.interest_paid ?? 0) + interestOwed,
        total_paid: totalPaid,
        paid_at: new Date().toISOString(),
        payment_note: 'Interest only',
      }).eq('id', row.id)
    }
    const { data: afterPay } = await db
      .from('loan_schedule')
      .select('*')
      .eq('loan_id', req.params.loanId)
      .order('installment_number', { ascending: true })
    const roll = planInterestRoll((afterPay ?? []).filter(row => !['paid', 'waived'].includes(row.status)), due_date, Number(loan.interest_rate ?? 0))
    if ('error' in roll) {
      res.status(400).json({ error: roll.error }); return
    }
    for (const row of roll.updates) {
      await db.from('loan_schedule').update({
        due_date: row.due_date,
        interest_due: row.interest_due,
        total_due: row.total_due,
      }).eq('id', row.id)
    }
    for (const commit of commits ?? []) {
      const share = Math.round(interestLeft * Number(commit.share_percent ?? 100) / 100)
      const { data: lenderWallet } = await db.from('wallets').select('id, available_balance, total_yield_earned').eq('user_id', commit.lender_id).single()
      if (lenderWallet) {
        await db.from('wallets').update({
          available_balance: lenderWallet.available_balance + share,
          total_yield_earned: (lenderWallet.total_yield_earned ?? 0) + share,
        }).eq('id', lenderWallet.id)
        await db.from('transactions').insert({
          user_id: commit.lender_id,
          wallet_id: lenderWallet.id,
          type: 'yield_distribution',
          amount: share,
          balance_after: lenderWallet.available_balance + share,
          related_loan_id: req.params.loanId,
          related_commitment_id: commit.id,
          description: 'Interest payment',
        })
      }
      await db.from('funding_commitments').update({
        actual_yield: (commit.actual_yield ?? 0) + share,
        expected_yield: Math.max(0, (commit.expected_yield ?? 0) + Math.round((interestDelta + roll.newInterest) * Number(commit.share_percent ?? 100) / 100)),
        status: 'repaying',
      }).eq('id', commit.id)
      await db.from('yield_distributions').insert({
        commitment_id: commit.id,
        schedule_id: aligned.rows[0]?.id,
        principal_return: 0,
        interest_return: share,
        total_return: share,
      })
    }
    await db.from('loans').update({
      status: 'repaying',
      maturity_date: roll.maturity,
      total_repayment: Math.max(0, (loan.total_repayment ?? 0) + interestDelta + roll.newInterest),
    }).eq('id', req.params.loanId)
    res.json({ total_paid: interestLeft, interest_only: true, new_due_date: roll.maturity })
    return
  }

  if (!schedule_id || !amount || amount <= 0) {
    res.status(400).json({ error: 'schedule_id and positive amount are required' })
    return
  }

  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('borrower_id, status')
    .eq('id', req.params.loanId)
    .single()

  if (!loan || loan.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' }); return
  }

  if (!['active', 'repaying'].includes(loan.status)) {
    res.status(400).json({ error: 'Loan is not in a payable state' }); return
  }

  if (advance) {
    const { data: priced } = await db
      .from('loans')
      .select('interest_rate, total_repayment')
      .eq('id', req.params.loanId)
      .single()
    const { data: schedule } = await db
      .from('loan_schedule')
      .select('*')
      .eq('loan_id', req.params.loanId)
      .order('installment_number', { ascending: true })
    const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status) && row.total_due - (row.total_paid ?? 0) > 0)
    const quote = quoteAdvance(open, Number(priced?.interest_rate ?? 0))
    if (!quote) {
      res.status(400).json({ error: 'This loan is already paid' }); return
    }
    const lateFees = open.reduce((sum, row) => sum + (row.late_fee ?? 0), 0)
    const { data: balance } = await db.from('wallets').select('available_balance').eq('user_id', user.id).single()
    if (!balance || balance.available_balance < quote.payoff_amount + lateFees) {
      res.status(400).json({ error: 'Insufficient wallet balance' }); return
    }
    const saved = reduceScheduleInterest(open, quote.interest_saved)
    for (const row of open) {
      const { error: cutError } = await db.from('loan_schedule').update({
        interest_due: row.interest_due,
        total_due: row.total_due,
      }).eq('id', row.id)
      if (cutError) { res.status(500).json({ error: cutError.message }); return }
    }
    if (saved > 0) {
      await db.from('loans').update({
        total_repayment: Math.max(0, (priced?.total_repayment ?? 0) - saved),
      }).eq('id', req.params.loanId)
      const { data: commits } = await db
        .from('funding_commitments')
        .select('id, expected_yield, share_percent')
        .eq('loan_id', req.params.loanId)
      for (const commit of commits ?? []) {
        const cut = Math.round(saved * Number(commit.share_percent ?? 100) / 100)
        await db.from('funding_commitments').update({
          expected_yield: Math.max(0, (commit.expected_yield ?? 0) - cut),
        }).eq('id', commit.id)
      }
    }

    let totalPaid = 0
    for (const row of open) {
      const { data, error } = await db.rpc('process_borrower_payment', {
        p_loan_id: req.params.loanId,
        p_schedule_id: row.id,
        p_amount: row.total_due + (row.late_fee ?? 0),
      })
      if (error) { res.status(500).json({ error: error.message }); return }
      totalPaid += Number((data as { total_paid?: number } | null)?.total_paid ?? 0)
    }
    res.json({ total_paid: totalPaid, interest_saved: saved })
    return
  }

  const { data: wallet } = await db
    .from('wallets')
    .select('available_balance')
    .eq('user_id', user.id)
    .single()

  if (!wallet || wallet.available_balance < amount) {
    res.status(400).json({ error: 'Insufficient wallet balance' }); return
  }

  const { data, error } = await db.rpc('process_borrower_payment', {
    p_loan_id: req.params.loanId,
    p_schedule_id: schedule_id,
    p_amount: amount,
  })

  if (error) {
    if (error.message.includes('ALREADY_PAID')) {
      res.status(409).json({ error: 'This installment has already been paid' })
    } else if (error.message.includes('INSUFFICIENT_BALANCE')) {
      res.status(400).json({ error: 'Insufficient balance' })
    } else {
      res.status(500).json({ error: error.message })
    }
    return
  }

  res.json(data)
})

export default router
