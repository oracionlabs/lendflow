import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/profile', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('lender_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ profile: data })
})

router.put('/profile', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { lender_type, risk_tolerance } = req.body as {
    lender_type?: 'individual' | 'institutional'
    risk_tolerance?: 'conservative' | 'moderate' | 'aggressive'
  }

  const { data, error } = await db
    .from('lender_profiles')
    .update({ lender_type, risk_tolerance })
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ profile: data })
})

router.post('/documents', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { type, file_url, file_name } = req.body as {
    type: string
    file_url: string
    file_name?: string
  }

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('documents')
    .insert({ user_id: user.id, type, file_url, file_name })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ document: data })
})

router.get('/commitments', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('funding_commitments')
    .select(`
      *,
      loans (
        id, purpose, term_months, interest_rate, ai_credit_grade,
        admin_override_grade, status, first_payment_date, maturity_date,
        amount_requested, approved_amount
      )
    `)
    .eq('lender_id', user.id)
    .order('funded_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ commitments: data })
})

router.get('/commitments/:id', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('funding_commitments')
    .select(`
      *,
      loans (
        id, purpose, purpose_description, term_months, interest_rate,
        ai_credit_grade, admin_override_grade, ai_reasoning, ai_risk_factors,
        status, first_payment_date, maturity_date, amount_requested, approved_amount,
        monthly_payment, total_repayment
      )
    `)
    .eq('id', req.params.id)
    .eq('lender_id', user.id)
    .single()

  if (error) { res.status(404).json({ error: 'Commitment not found' }); return }
  res.json({ commitment: data })
})

router.get('/commitments/:id/yields', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: commitment } = await db
    .from('funding_commitments')
    .select('id')
    .eq('id', req.params.id)
    .eq('lender_id', user.id)
    .single()

  if (!commitment) { res.status(404).json({ error: 'Commitment not found' }); return }

  const { data, error } = await db
    .from('yield_distributions')
    .select('*')
    .eq('commitment_id', req.params.id)
    .order('distributed_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ yields: data })
})

router.get('/portfolio/summary', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: commitments } = await db
    .from('funding_commitments')
    .select('amount, expected_yield, actual_yield, status, funded_at, loans(interest_rate, term_months, ai_credit_grade, admin_override_grade)')
    .eq('lender_id', user.id)

  const { data: wallet } = await db
    .from('wallets')
    .select('total_yield_earned, available_balance, committed_balance')
    .eq('user_id', user.id)
    .single()

  const active = commitments?.filter(c => ['active', 'repaying'].includes(c.status)) ?? []
  const totalCommitted = active.reduce((s, c) => s + c.amount, 0)
  const projectedYield = active.reduce((s, c) => s + (c.expected_yield - c.actual_yield), 0)

  res.json({
    total_committed: totalCommitted,
    active_loans: active.length,
    total_yield_earned: wallet?.total_yield_earned ?? 0,
    projected_future_yield: projectedYield,
    available_balance: wallet?.available_balance ?? 0,
    committed_balance: wallet?.committed_balance ?? 0,
    total_commitments: commitments?.length ?? 0,
  })
})

router.get('/portfolio/yield-chart', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data } = await db
    .from('yield_distributions')
    .select('interest_return, distributed_at, funding_commitments!inner(lender_id)')
    .eq('funding_commitments.lender_id', user.id)
    .order('distributed_at', { ascending: true })

  const monthly: Record<string, number> = {}
  for (const row of data ?? []) {
    const month = row.distributed_at.slice(0, 7)
    monthly[month] = (monthly[month] ?? 0) + row.interest_return
  }

  let cumulative = 0
  const chart = Object.entries(monthly).map(([month, amount]) => {
    cumulative += amount
    return { month, amount, cumulative }
  })

  res.json({ chart })
})

router.get('/portfolio/diversification', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data } = await db
    .from('funding_commitments')
    .select('amount, loans(ai_credit_grade, admin_override_grade)')
    .eq('lender_id', user.id)
    .in('status', ['active', 'repaying'])

  const byGrade: Record<string, number> = {}
  for (const c of data ?? []) {
    const loan = c.loans as { ai_credit_grade?: string; admin_override_grade?: string } | null
    const grade = loan?.admin_override_grade ?? loan?.ai_credit_grade ?? 'Unknown'
    byGrade[grade] = (byGrade[grade] ?? 0) + c.amount
  }

  res.json({ diversification: Object.entries(byGrade).map(([grade, amount]) => ({ grade, amount })) })
})

router.get('/portfolio/income-summary', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const year = parseInt(req.query.year as string) || new Date().getFullYear()
  const db = supabaseAdmin()

  const startDate = `${year}-01-01`
  const endDate = `${year + 1}-01-01`

  const { data } = await db
    .from('yield_distributions')
    .select(`
      interest_return, principal_return, total_return, distributed_at,
      funding_commitments!inner(lender_id, loan_id, loans(purpose))
    `)
    .eq('funding_commitments.lender_id', user.id)
    .gte('distributed_at', startDate)
    .lt('distributed_at', endDate)

  const totalInterest = data?.reduce((s, r) => s + r.interest_return, 0) ?? 0
  const byLoan: Record<string, { purpose: string; interest: number }> = {}

  for (const row of data ?? []) {
    const fc = row.funding_commitments as { loan_id: string; loans?: { purpose: string } } | null
    const loanId = fc?.loan_id ?? ''
    const purpose = fc?.loans?.purpose ?? 'unknown'
    if (!byLoan[loanId]) byLoan[loanId] = { purpose, interest: 0 }
    byLoan[loanId].interest += row.interest_return
  }

  res.json({
    year,
    total_interest_income: totalInterest,
    by_loan: Object.entries(byLoan).map(([loan_id, v]) => ({ loan_id, ...v })),
  })
})

export default router
