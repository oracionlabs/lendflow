import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireBorrower } from '../middleware/requireRole'
import { assessCredit } from '../lib/credit-assessment'
import { previewMonthlyPayment } from '../lib/amortization'
import { quoteAdvance, quoteAsOfToday } from '@lendflow/shared'
import { createNotification } from '../lib/notifications'
import { CREDIT_GRADE_RATES } from '@lendflow/shared'
import type { User } from '@lendflow/shared'

const router = Router()

function incomeToRange(cents?: number): string {
  if (!cents) return 'Not provided'
  const k = cents / 100_000
  if (k < 30) return 'Under $30k'
  if (k < 50) return '$30k–$50k'
  if (k < 75) return '$50k–$75k'
  if (k < 100) return '$75k–$100k'
  if (k < 150) return '$100k–$150k'
  return '$150k+'
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user as User
  const db = supabaseAdmin()

  if (user.role === 'lender') {
    const { page = '1', limit = '20', grade, purpose, min_rate, max_rate } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = db
      .from('loans')
      .select(`
        id, purpose, purpose_description, term_months, interest_rate, approved_amount,
        ai_credit_grade, admin_override_grade, ai_confidence,
        amount_funded, funding_percent, lender_count, funding_deadline, status, created_at
      `, { count: 'exact' })
      .eq('status', 'funding')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1)

    if (grade) query = query.eq('ai_credit_grade', grade)
    if (purpose) query = query.eq('purpose', purpose)
    if (min_rate) query = query.gte('interest_rate', parseFloat(min_rate))
    if (max_rate) query = query.lte('interest_rate', parseFloat(max_rate))

    const { data, error, count } = await query
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ loans: data, total: count })
    return
  }

  if (user.role === 'borrower') {
    const { data, error } = await db
      .from('loans')
      .select(`
        *,
        funding_commitments (
          users!lender_id ( name )
        ),
        loan_schedule (
          installment_number, due_date, total_due, total_paid, status
        )
      `)
      .eq('borrower_id', user.id)
      .order('created_at', { ascending: false })

    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ loans: data })
    return
  }

  res.status(403).json({ error: 'Forbidden' })
})

router.get('/preview', async (req: Request, res: Response): Promise<void> => {
  const { amount, term_months, grade } = req.query as Record<string, string>
  if (!amount || !term_months) {
    res.status(400).json({ error: 'amount and term_months required' })
    return
  }

  const rate = CREDIT_GRADE_RATES[grade ?? 'C'] ?? CREDIT_GRADE_RATES.C
  const payment = previewMonthlyPayment(parseInt(amount), rate, parseInt(term_months))
  res.json({ monthly_payment: payment, interest_rate: rate })
})

router.post('/', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { amount_requested, purpose, purpose_description, term_months } = req.body as {
    amount_requested: number
    purpose: string
    purpose_description?: string
    term_months: number
  }

  if (!amount_requested || !purpose || !term_months) {
    res.status(400).json({ error: 'amount_requested, purpose, and term_months are required' })
    return
  }

  const db = supabaseAdmin()

  const { data: existingPending } = await db
    .from('loans')
    .select('id')
    .eq('borrower_id', user.id)
    .in('status', ['submitted', 'under_review'])
    .limit(1)
    .single()

  if (existingPending) {
    res.status(409).json({ error: 'You already have an application under review' })
    return
  }

  const { data, error } = await db
    .from('loans')
    .insert({
      borrower_id: user.id,
      amount_requested,
      purpose,
      purpose_description,
      term_months,
      status: 'draft',
    })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ loan: data })
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user as User
  const db = supabaseAdmin()

  const { data: loan, error } = await db
    .from('loans')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !loan) { res.status(404).json({ error: 'Loan not found' }); return }

  if (user.role === 'borrower' && loan.borrower_id !== user.id) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  if (user.role === 'lender') {
    const publicStatuses = ['funding', 'fully_funded', 'active', 'repaying', 'completed', 'defaulted']
    if (!publicStatuses.includes(loan.status)) {
      res.status(404).json({ error: 'Loan not found' })
      return
    }

    const { data: profile } = await db
      .from('borrower_profiles')
      .select('annual_income, employment_status, monthly_expenses, credit_score_range')
      .eq('user_id', loan.borrower_id)
      .single()

    const dti = loan.debt_to_income_ratio
    const lenderView = {
      id: loan.id,
      purpose: loan.purpose,
      purpose_description: loan.purpose_description,
      term_months: loan.term_months,
      interest_rate: loan.interest_rate,
      approved_amount: loan.approved_amount,
      monthly_payment: loan.monthly_payment,
      total_repayment: loan.total_repayment,
      ai_credit_grade: loan.ai_credit_grade,
      admin_override_grade: loan.admin_override_grade,
      ai_confidence: loan.ai_confidence,
      ai_reasoning: loan.ai_reasoning,
      ai_risk_factors: loan.ai_risk_factors,
      debt_to_income_ratio: dti,
      amount_funded: loan.amount_funded,
      funding_percent: loan.funding_percent,
      lender_count: loan.lender_count,
      funding_deadline: loan.funding_deadline,
      status: loan.status,
      created_at: loan.created_at,
      borrower_summary: profile
        ? {
            income_range: incomeToRange(profile.annual_income),
            employment_type: profile.employment_status,
            credit_score_band: profile.credit_score_range,
            dti_ratio: dti,
          }
        : null,
    }

    res.json({ loan: lenderView })
    return
  }

  let instapay_qr: string | null = null
  if (loan.payment_channel === 'instapay') {
    const { data: commit } = await db
      .from('funding_commitments')
      .select('lender_id')
      .eq('loan_id', loan.id)
      .limit(1)
      .maybeSingle()
    if (commit?.lender_id) {
      const { data: lenderProfile } = await db
        .from('lender_profiles')
        .select('instapay_qr')
        .eq('user_id', commit.lender_id)
        .maybeSingle()
      instapay_qr = lenderProfile?.instapay_qr ?? null
    }
  }

  res.json({ loan, instapay_qr })
})

router.put('/:id', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: existing } = await db
    .from('loans')
    .select('status, borrower_id')
    .eq('id', req.params.id)
    .single()

  if (!existing || existing.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' })
    return
  }

  if (existing.status !== 'draft') {
    res.status(400).json({ error: 'Only draft loans can be edited' })
    return
  }

  const allowed = ['amount_requested', 'purpose', 'purpose_description', 'term_months']
  const updates = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await db
    .from('loans')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ loan: data })
})

router.post('/:id/submit', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('*')
    .eq('id', req.params.id)
    .eq('borrower_id', user.id)
    .single()

  if (!loan) { res.status(404).json({ error: 'Loan not found' }); return }
  if (loan.status !== 'draft') {
    res.status(400).json({ error: 'Only draft loans can be submitted' })
    return
  }

  const { data: profile } = await db
    .from('borrower_profiles')
    .select('annual_income, monthly_expenses, employment_status, credit_score_range')
    .eq('user_id', user.id)
    .single()

  let assessmentData: Partial<{
    ai_credit_grade: string
    ai_confidence: number
    ai_reasoning: string
    ai_risk_factors: string[]
    debt_to_income_ratio: number
  }> = {}

  if (profile?.annual_income && profile?.monthly_expenses && profile?.employment_status) {
    try {
      const result = await assessCredit({
        annual_income: profile.annual_income,
        monthly_expenses: profile.monthly_expenses,
        employment_status: profile.employment_status,
        loan_amount: loan.amount_requested,
        term_months: loan.term_months,
        purpose: loan.purpose,
        credit_score_range: profile.credit_score_range ?? 'fair',
      })
      assessmentData = {
        ai_credit_grade: result.grade,
        ai_confidence: result.confidence,
        ai_reasoning: result.reasoning,
        ai_risk_factors: result.risk_factors,
        debt_to_income_ratio: result.debt_to_income_ratio,
      }
    } catch (err) {
      console.error('[credit-assessment] failed:', err)
    }
  }

  const { data: updated, error } = await db
    .from('loans')
    .update({ status: 'submitted', ...assessmentData })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ loan: updated })
})

router.post('/:id/cancel', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { reason } = req.body as { reason?: string }
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('status, borrower_id')
    .eq('id', req.params.id)
    .single()

  if (!loan || loan.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' }); return
  }

  const cancellable = ['draft', 'submitted', 'under_review', 'approved', 'funding', 'fully_funded']
  if (!cancellable.includes(loan.status)) {
    res.status(400).json({ error: 'This loan can no longer be cancelled' }); return
  }

  await db.from('loans').update({
    status: 'cancelled',
    rejection_reason: reason ?? null,
  }).eq('id', req.params.id)
  res.json({ success: true })
})

router.get('/:id/schedule', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user as User
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('borrower_id, status')
    .eq('id', req.params.id)
    .single()

  if (!loan) { res.status(404).json({ error: 'Loan not found' }); return }

  if (user.role === 'borrower' && loan.borrower_id !== user.id) {
    res.status(403).json({ error: 'Forbidden' }); return
  }

  const { data, error } = await db
    .from('loan_schedule')
    .select('*')
    .eq('loan_id', req.params.id)
    .order('installment_number', { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ schedule: data })
})

router.get('/:id/payoff-quote', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('borrower_id, approved_amount, interest_rate, monthly_payment')
    .eq('id', req.params.id)
    .single()

  if (!loan || loan.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' }); return
  }

  const { data: schedule } = await db
    .from('loan_schedule')
    .select('*')
    .eq('loan_id', req.params.id)
    .order('installment_number', { ascending: true })

  const quote = quoteAdvance(schedule ?? [], Number(loan.interest_rate ?? 0))
  if (!quote) {
    res.json({ payoff_amount: 0, interest_saved: 0 }); return
  }

  res.json({
    payoff_amount: quote.payoff_amount,
    interest_saved: quote.interest_saved,
    days_early: quote.days_early,
    due_date: quote.due_date,
  })
})

router.get('/:id/yield-preview', async (req: Request, res: Response): Promise<void> => {
  const { amount } = req.query as { amount: string }
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('approved_amount, interest_rate, term_months, monthly_payment')
    .eq('id', req.params.id)
    .single()

  if (!loan || !amount) {
    res.status(400).json({ error: 'Loan not found or amount missing' }); return
  }

  const commitAmount = parseInt(amount)
  const sharePercent = commitAmount / (loan.approved_amount ?? 1)
  const totalYield = Math.round(
    commitAmount * (loan.interest_rate ?? 0) * (loan.term_months ?? 12) / 12
  )
  const monthlyYield = Math.round(totalYield / (loan.term_months ?? 12))

  res.json({
    commit_amount: commitAmount,
    share_percent: sharePercent * 100,
    projected_total_yield: totalYield,
    projected_monthly_yield: monthlyYield,
  })
})

router.get('/:id/requests', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data: loan } = await db.from('loans').select('borrower_id').eq('id', req.params.id).maybeSingle()
  if (!loan || loan.borrower_id !== user.id) { res.status(404).json({ error: 'Loan not found' }); return }
  const { data, error } = await db
    .from('borrower_requests')
    .select('id, kind, requested_due_date, amount, note, receipt_url, status, created_at')
    .eq('loan_id', req.params.id)
    .order('created_at', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ requests: data ?? [] })
})

router.post('/:id/requests', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { kind, due_date, note, receipt_url } = req.body as {
    kind?: 'extension' | 'interest_only' | 'pay_in_full'
    due_date?: string
    note?: string
    receipt_url?: string
  }
  if (kind !== 'extension' && kind !== 'interest_only' && kind !== 'pay_in_full') {
    res.status(400).json({ error: 'Choose an extension, an interest-only payment, or pay in full' })
    return
  }
  if ((kind === 'extension' || kind === 'interest_only') && (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date))) {
    res.status(400).json({ error: 'Choose a new due date' })
    return
  }

  const db = supabaseAdmin()
  const { data: loan } = await db
    .from('loans')
    .select('id, borrower_id, status, interest_rate, payment_channel')
    .eq('id', req.params.id)
    .maybeSingle()
  if (!loan || loan.borrower_id !== user.id) { res.status(404).json({ error: 'Loan not found' }); return }
  if (!['active', 'repaying'].includes(loan.status)) {
    res.status(400).json({ error: 'This loan is not open' })
    return
  }
  if (loan.payment_channel !== 'instapay') {
    res.status(400).json({ error: 'Use the payment buttons on this loan' })
    return
  }

  const { data: schedule } = await db
    .from('loan_schedule')
    .select('due_date, principal_due, principal_paid, interest_due, interest_paid, total_due, total_paid, status')
    .eq('loan_id', loan.id)
    .order('installment_number', { ascending: true })
  const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status))
  if (!open.length) { res.status(400).json({ error: 'This loan is already paid' }); return }

  const todayQuote = quoteAsOfToday(open, Number(loan.interest_rate))
  const interestLeft = todayQuote?.interest_today ?? 0
  let amount = interestLeft
  let requestedDue = due_date ?? null
  if (kind === 'extension') {
    const last = open[open.length - 1]
    const extraDays = Math.round((Date.parse(`${due_date}T00:00:00Z`) - Date.parse(`${last.due_date}T00:00:00Z`)) / 86400000)
    if (extraDays <= 0) {
      res.status(400).json({ error: 'The new due date has to be after the current full-payment date' })
      return
    }
    const principal = open.reduce((sum, row) => sum + Math.max(0, row.principal_due - (row.principal_paid ?? 0)), 0)
    amount = Math.round(principal * Number(loan.interest_rate) * extraDays / 365)
    requestedDue = due_date ?? null
  } else if (kind === 'pay_in_full') {
    amount = todayQuote?.payment_today ?? 0
    if (amount <= 0) {
      res.status(400).json({ error: 'This loan is already paid' })
      return
    }
  } else if (kind === 'interest_only') {
    if (interestLeft <= 0) {
      res.status(400).json({ error: 'No interest is left on this loan' })
      return
    }
    const last = open[open.length - 1]
    const extraDays = Math.round((Date.parse(`${due_date}T00:00:00Z`) - Date.parse(`${last.due_date}T00:00:00Z`)) / 86400000)
    if (extraDays <= 0) {
      res.status(400).json({ error: 'The new due date has to be after the current due date' })
      return
    }
    amount = interestLeft
    requestedDue = due_date ?? null
  }

  const noteText = typeof note === 'string' ? note.trim().slice(0, 500) : ''
  const receipt = typeof receipt_url === 'string' && receipt_url.startsWith('data:image/')
    ? receipt_url.slice(0, 5_500_000)
    : null
  if (typeof receipt_url === 'string' && receipt_url.length > 0 && !receipt) {
    res.status(400).json({ error: 'Upload a receipt image' })
    return
  }

  const { data: existing } = await db
    .from('borrower_requests')
    .select('id')
    .eq('loan_id', loan.id)
    .eq('kind', kind)
    .eq('status', 'pending')
    .maybeSingle()

  const payload = {
    requested_due_date: requestedDue,
    amount,
    note: noteText || null,
    receipt_url: receipt,
  }
  const saved = existing
    ? await db.from('borrower_requests').update(payload).eq('id', existing.id).select('id, kind, requested_due_date, amount, note, receipt_url, status, created_at').single()
    : await db.from('borrower_requests').insert({
        loan_id: loan.id,
        borrower_id: user.id,
        kind,
        ...payload,
      }).select('id, kind, requested_due_date, amount, note, receipt_url, status, created_at').single()

  if (saved.error) { res.status(500).json({ error: saved.error.message }); return }

  const { data: commitment } = await db
    .from('funding_commitments')
    .select('id, lender_id')
    .eq('loan_id', loan.id)
    .limit(1)
    .maybeSingle()
  if (commitment && !existing) {
    await createNotification({
      user_id: commitment.lender_id,
      type: 'system',
      title: kind === 'extension' ? 'Extension requested' : kind === 'pay_in_full' ? 'Pay in full' : 'Interest-only payment',
      body: kind === 'extension'
        ? 'A borrower asked to move a due date.'
        : kind === 'pay_in_full'
          ? receipt || noteText
            ? 'A borrower sent a pay-off with a note or receipt for you to confirm.'
            : 'A borrower asked you to confirm a full payment.'
          : receipt || noteText
            ? 'A borrower sent an interest payment with a note or receipt for you to confirm.'
            : 'A borrower asked you to record the interest and move the principal due date.',
      link: `/lender/commitments/${commitment.id}`,
    }).catch(() => undefined)
  }

  res.status(existing ? 200 : 201).json({ request: saved.data })
})

export default router
