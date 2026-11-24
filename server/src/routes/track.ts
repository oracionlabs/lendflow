import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token)
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
    res.status(404).json({ error: 'Link not found' })
    return
  }

  const db = supabaseAdmin()
  const { data: access } = await db
    .from('loan_access')
    .select('borrower_id, lender_id')
    .eq('token', token)
    .maybeSingle()

  if (!access) {
    res.status(404).json({ error: 'Link not found' })
    return
  }

  const [{ data: borrower }, { data: lender }, { data: profile }, { data: commitments }] = await Promise.all([
    db.from('users').select('name').eq('id', access.borrower_id).maybeSingle(),
    db.from('users').select('name').eq('id', access.lender_id).maybeSingle(),
    db.from('lender_profiles').select('instapay_qr').eq('user_id', access.lender_id).maybeSingle(),
    db.from('funding_commitments').select('loan_id').eq('lender_id', access.lender_id),
  ])

  const loanIds = (commitments ?? []).map(row => row.loan_id as string)
  if (!loanIds.length) {
    res.json({
      borrower_name: borrower?.name ?? 'Borrower',
      lender_name: lender?.name ?? 'Lender',
      instapay_qr: profile?.instapay_qr ?? null,
      loans: [],
    })
    return
  }

  const { data: loans, error } = await db
    .from('loans')
    .select(`
      id, purpose, status, currency, approved_amount, amount_requested,
      loan_kind, product_name, interest_rate,
      monthly_payment, total_repayment, term_months, maturity_date,
      verification_mode, payment_channel,
      loan_schedule (
        installment_number, due_date, total_due, total_paid, status, paid_at, payment_note,
        principal_due, principal_paid, interest_due, interest_paid
      )
    `)
    .eq('borrower_id', access.borrower_id)
    .in('id', loanIds)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({
    borrower_name: borrower?.name ?? 'Borrower',
    lender_name: lender?.name ?? 'Lender',
    instapay_qr: profile?.instapay_qr ?? null,
    loans: loans ?? [],
  })
})

export default router
