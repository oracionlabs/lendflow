import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireBorrower } from '../middleware/requireRole'
import { assessCredit } from '../lib/credit-assessment'
import { previewMonthlyPayment } from '../lib/amortization'
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
      .select('*')
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

  res.json({ loan })
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

  const cancellable = ['draft', 'submitted', 'under_review', 'approved', 'funding', 'fully_funded', 'active', 'repaying']
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
    .not('status', 'in', '("paid","waived")')
    .order('installment_number', { ascending: true })

  if (!schedule?.length) {
    res.json({ payoff_amount: 0, interest_saved: 0 }); return
  }

  const remainingBalance = schedule.reduce((s, r) => s + r.principal_due - r.principal_paid, 0)
  const interestSaved = schedule.reduce((s, r) => s + r.interest_due - r.interest_paid, 0)

  res.json({ payoff_amount: remainingBalance, interest_saved: interestSaved })
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

export default router
