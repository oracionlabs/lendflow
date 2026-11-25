import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { assessCredit } from '../lib/credit-assessment'
import { ensureLoanAccess } from '../lib/loan-access'
import { partialAdvanceSavings, quoteAdvance } from '@lendflow/shared'

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

router.put('/instapay-qr', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { qr } = req.body as { qr?: string | null }
  if (qr && (qr.length > 1_500_000 || !/^(data:image\/[a-zA-Z0-9.+-]+;base64,|https:\/\/)/.test(qr))) {
    res.status(400).json({ error: 'InstaPay QR must be an image or an https link' })
    return
  }
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('lender_profiles')
    .update({ instapay_qr: qr || null })
    .eq('user_id', user.id)
    .select('instapay_qr')
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ instapay_qr: data?.instapay_qr ?? null })
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
        id, purpose, repayment_type, term_months, interest_rate, ai_credit_grade,
        admin_override_grade, status, first_payment_date, maturity_date,
        amount_requested, approved_amount, monthly_payment, currency,
        loan_kind, product_name, payment_channel,
        users!borrower_id (name),
        loan_schedule (installment_number, due_date, total_due, total_paid, status, principal_due, principal_paid, interest_due, interest_paid, paid_at)
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
        id, purpose, purpose_description, repayment_type, term_months, interest_rate,
        ai_credit_grade, admin_override_grade, ai_reasoning, ai_risk_factors,
        status, first_payment_date, maturity_date, amount_requested, approved_amount,
        monthly_payment, total_repayment, currency, borrower_id,
        verification_mode, payment_channel, verification_note, loan_kind, product_name
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
    const fc = row.funding_commitments as unknown as { loan_id: string; loans?: { purpose: string } } | null
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

// Create a private direct loan.
// Contact info is optional — communication happens outside the app.
// Loan is immediately active (lender confirms funds were already sent).
router.post('/loans/new', async (req: Request, res: Response): Promise<void> => {
  const lender = res.locals.user
  const {
    borrower_name,
    borrower_email,
    borrower_phone,
    purpose,
    notes,
    amount_requested,
    interest_rate,
    monthly_payment: clientMonthlyPayment,
    total_repayment: clientTotalRepayment,
    payment_type,
    repayment_type: repaymentTypeInput,
    due_date,
    term_months: termMonthsInput,
    payment_frequency,
    max_term_days,
    currency,
    waive_docs,
    loan_kind,
    product_name,
    payments,
  } = req.body as {
    borrower_name: string
    borrower_email?: string
    borrower_phone?: string
    purpose: string
    notes?: string
    amount_requested: number
    interest_rate: number
    monthly_payment: number
    total_repayment: number
    payment_type: string
    repayment_type?: string
    due_date?: string
    term_months?: number
    payment_frequency?: string
    max_term_days?: number
    currency?: string
    waive_docs?: boolean
    loan_kind?: 'cash' | 'product'
    product_name?: string
    payments?: { due_date?: string; amount?: number }[]
  }

  // repayment_type is the new field; payment_type is legacy — accept both
  const effectiveRepaymentType = repaymentTypeInput ?? payment_type ?? 'installments'

  const kind = loan_kind === 'product' ? 'product' : 'cash'
  const productName = product_name?.trim() || ''
  if (kind === 'product' && !productName) {
    res.status(400).json({ error: 'product_name is required for a product loan' })
    return
  }
  if (!borrower_name || !purpose || !amount_requested || !effectiveRepaymentType) {
    res.status(400).json({ error: 'borrower_name, purpose, amount_requested, and repayment_type are required' })
    return
  }
  if (effectiveRepaymentType === 'lump_sum' && !due_date) {
    res.status(400).json({ error: 'due_date is required for lump sum payment' })
    return
  }
  if (['installments', 'interest_only'].includes(effectiveRepaymentType) && !termMonthsInput) {
    res.status(400).json({ error: 'term_months is required for this repayment type' })
    return
  }
  if (effectiveRepaymentType === 'daily_interest' && !max_term_days) {
    res.status(400).json({ error: 'max_term_days is required for daily_interest' })
    return
  }
  if (effectiveRepaymentType === 'custom_schedule' && (!termMonthsInput || !payment_frequency)) {
    res.status(400).json({ error: 'term_months and payment_frequency are required for custom_schedule' })
    return
  }
  const datedPayments = (payments ?? [])
    .map(row => ({ due_date: row.due_date ?? '', amount: Math.round(row.amount ?? 0) }))
    .filter(row => row.due_date || row.amount)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  if (effectiveRepaymentType === 'dated') {
    if (!datedPayments.length || datedPayments.some(row => !/^\d{4}-\d{2}-\d{2}$/.test(row.due_date) || row.amount <= 0)) {
      res.status(400).json({ error: 'Each payment needs a date and an amount' })
      return
    }
    const datedTotal = datedPayments.reduce((sum, row) => sum + row.amount, 0)
    if (datedTotal !== amount_requested) {
      res.status(400).json({ error: 'Payment amounts must add up to the loan amount' })
      return
    }
  }

  const db = supabaseAdmin()

  // Find or create a borrower record
  let borrowerId: string

  if (borrower_email) {
    // Try to find existing borrower by email
    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('email', borrower_email.toLowerCase().trim())
      .eq('role', 'borrower')
      .maybeSingle()

    if (existing) {
      borrowerId = existing.id
    } else {
      // Create auth account so borrower can eventually log in
      const tempPassword = `LF-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
      const { data: authData, error: authErr } = await db.auth.admin.createUser({
        email: borrower_email.toLowerCase().trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: borrower_name, role: 'borrower' },
      })
      if (authErr || !authData.user) {
        res.status(400).json({ error: authErr?.message ?? 'Failed to create borrower account' }); return
      }
      const { error: rpcErr } = await db.rpc('register_user', {
        p_auth_id: authData.user.id,
        p_email: borrower_email.toLowerCase().trim(),
        p_name: borrower_name,
        p_role: 'borrower',
      })
      if (rpcErr) {
        await db.auth.admin.deleteUser(authData.user.id)
        res.status(500).json({ error: 'Failed to set up borrower profile' }); return
      }
      if (borrower_phone) {
        await db.from('users').update({ phone: borrower_phone }).eq('id', authData.user.id)
      }
      borrowerId = authData.user.id
    }
  } else {
    // No email — create a tracking-only record directly in the DB
    const { data: newUser, error: userErr } = await db
      .from('users')
      .insert({
        email: `noemail-${Date.now()}@internal.lendflow`,
        name: borrower_name,
        phone: borrower_phone ?? null,
        role: 'borrower',
        email_verified: false,
        status: 'active',
      })
      .select('id')
      .single()
    if (userErr || !newUser) {
      res.status(500).json({ error: 'Failed to create borrower record' }); return
    }
    borrowerId = newUser.id
    await db.from('borrower_profiles').insert({ user_id: borrowerId })
    await db.from('wallets').insert({ user_id: borrowerId })
    await db.from('notification_preferences').insert({ user_id: borrowerId })
  }

  // Use client-calculated values (client owns rate structure logic)
  const today = new Date()
  const firstPaymentDate = new Date(today)
  firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1)
  firstPaymentDate.setDate(1)
  const firstPaymentStr = firstPaymentDate.toISOString().split('T')[0]

  let term_months: number
  let maturityDate: string

  if (effectiveRepaymentType === 'dated') {
    const first = datedPayments[0].due_date
    const last = datedPayments[datedPayments.length - 1].due_date
    const start = new Date(`${first}T00:00:00Z`)
    const end = new Date(`${last}T00:00:00Z`)
    term_months = Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()))
    maturityDate = last
  } else if (effectiveRepaymentType === 'lump_sum') {
    const dueD = new Date(due_date!)
    term_months = Math.max(1,
      (dueD.getFullYear() - today.getFullYear()) * 12 + (dueD.getMonth() - today.getMonth())
    )
    maturityDate = due_date!
  } else if (effectiveRepaymentType === 'daily_interest') {
    term_months = Math.ceil((max_term_days ?? 90) / 30)
    const mat = new Date(today)
    mat.setDate(mat.getDate() + (max_term_days ?? 90))
    maturityDate = mat.toISOString().split('T')[0]
  } else {
    term_months = termMonthsInput!
    const mat = new Date(firstPaymentDate)
    mat.setMonth(mat.getMonth() + term_months - 1)
    maturityDate = mat.toISOString().split('T')[0]
  }

  const monthlyPayment = clientMonthlyPayment ?? 0
  const totalRepayment = clientTotalRepayment ?? amount_requested

  // Create loan as active (funds already sent by lender)
  const { data: loan, error: loanErr } = await db.from('loans').insert({
    borrower_id: borrowerId,
    amount_requested,
    purpose,
    purpose_description: [notes, borrower_phone ? `Phone: ${borrower_phone}` : ''].filter(Boolean).join(' | '),
    term_months,
    approved_amount: amount_requested,
    interest_rate: effectiveRepaymentType === 'dated' ? 0 : interest_rate,
    monthly_payment: effectiveRepaymentType === 'dated' ? datedPayments[0].amount : monthlyPayment,
    total_repayment: effectiveRepaymentType === 'dated' ? amount_requested : totalRepayment,
    origination_fee: 0,
    origination_fee_percent: 0,
    repayment_type: effectiveRepaymentType,
    payment_frequency: payment_frequency ?? null,
    max_term_days: max_term_days ?? null,
    currency: currency ?? 'PHP',
    verification_mode: waive_docs === false ? 'formal' : 'manual',
    verification_note: waive_docs === false ? null : 'Lender verified this person directly and waived documents.',
    payment_channel: 'instapay',
    loan_kind: kind,
    product_name: kind === 'product' ? productName : null,
    amount_funded: amount_requested,
    funding_percent: 100,
    lender_count: 1,
    fully_funded_at: today.toISOString(),
    status: 'active',
    reviewed_by: lender.id,
    reviewed_at: today.toISOString(),
    disbursed_at: today.toISOString(),
    first_payment_date: effectiveRepaymentType === 'dated' ? datedPayments[0].due_date : firstPaymentStr,
    maturity_date: maturityDate,
  }).select().single()

  if (loanErr || !loan) { res.status(500).json({ error: loanErr?.message }); return }

  // Create 100% funding commitment for the lender
  const totalInterest = effectiveRepaymentType === 'dated' ? 0 : totalRepayment - amount_requested
  await db.from('funding_commitments').insert({
    lender_id: lender.id,
    loan_id: loan.id,
    amount: amount_requested,
    share_percent: 100,
    expected_yield: totalInterest,
    actual_yield: 0,
    status: 'active',
    funded_at: today.toISOString(),
  })

  // Build amortization schedule based on repayment type
  const {
    calculateAmortization,
    calculateInterestOnly,
    calculateDailyInterest,
    calculateCustomSchedule,
  } = await import('../lib/amortization')

  let scheduleRows: { installment_number: number; due_date: string; principal_due: number; interest_due: number; total_due: number }[]

  if (effectiveRepaymentType === 'dated') {
    scheduleRows = datedPayments.map((row, index) => ({
      installment_number: index + 1,
      due_date: row.due_date,
      principal_due: row.amount,
      interest_due: 0,
      total_due: row.amount,
    }))
  } else if (effectiveRepaymentType === 'lump_sum') {
    scheduleRows = [{ installment_number: 1, due_date: maturityDate, principal_due: amount_requested, interest_due: totalRepayment - amount_requested, total_due: totalRepayment }]
  } else if (effectiveRepaymentType === 'interest_only') {
    const result = calculateInterestOnly(amount_requested, interest_rate, term_months, firstPaymentStr)
    scheduleRows = result.schedule
  } else if (effectiveRepaymentType === 'daily_interest') {
    const dailyRate = interest_rate / 365
    const result = calculateDailyInterest(amount_requested, dailyRate, max_term_days ?? 90, firstPaymentStr)
    scheduleRows = result.schedule
  } else if (effectiveRepaymentType === 'custom_schedule') {
    const freq = (payment_frequency ?? 'monthly') as 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly'
    const result = calculateCustomSchedule(amount_requested, interest_rate, term_months, freq, firstPaymentStr)
    scheduleRows = result.schedule
  } else {
    const amort = calculateAmortization(amount_requested, interest_rate, term_months, firstPaymentStr)
    scheduleRows = amort.schedule
  }

  await db.from('loan_schedule').insert(
    scheduleRows.map(row => ({
      loan_id: loan.id,
      installment_number: row.installment_number,
      due_date: row.due_date,
      principal_due: row.principal_due,
      interest_due: row.interest_due,
      total_due: row.total_due,
      principal_paid: 0,
      interest_paid: 0,
      total_paid: 0,
      late_fee: 0,
      status: 'upcoming',
      days_late: 0,
    }))
  )

  let access_token: string
  try {
    access_token = await ensureLoanAccess(db, borrowerId, lender.id)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not create a share link' })
    return
  }

  res.status(201).json({ loan, access_token })
})

router.get('/loans/:loanId/access', async (req: Request, res: Response): Promise<void> => {
  const lender = res.locals.user
  const db = supabaseAdmin()
  const { data: commitment } = await db
    .from('funding_commitments')
    .select('loan_id, loans!inner(borrower_id, verification_mode, payment_channel)')
    .eq('lender_id', lender.id)
    .eq('loan_id', req.params.loanId)
    .limit(1)
    .maybeSingle()

  if (!commitment) { res.status(404).json({ error: 'Loan not found' }); return }
  const loan = commitment.loans as { borrower_id: string; verification_mode?: string; payment_channel?: string } | { borrower_id: string; verification_mode?: string; payment_channel?: string }[]
  const row = Array.isArray(loan) ? loan[0] : loan
  if (!row?.borrower_id) { res.status(404).json({ error: 'Loan not found' }); return }

  try {
    const token = await ensureLoanAccess(db, row.borrower_id, lender.id)
    res.json({
      access_token: token,
      verification_mode: row.verification_mode ?? 'formal',
      payment_channel: row.payment_channel ?? 'wallet',
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not create a share link' })
  }
})

router.post('/loans/:loanId/instapay-payment', async (req: Request, res: Response): Promise<void> => {
  const lender = res.locals.user
  const { schedule_id, amount, mode, received_date, method, note: paymentNote } = req.body as {
    schedule_id?: string
    amount?: number
    mode?: 'partial' | 'full' | 'installment' | 'advance'
    received_date?: string
    method?: string
    note?: string
  }

  const db = supabaseAdmin()
  const { data: commitment } = await db
    .from('funding_commitments')
    .select('id, actual_yield, expected_yield, share_percent, loans!inner(id, borrower_id, payment_channel, status, interest_rate, total_repayment)')
    .eq('lender_id', lender.id)
    .eq('loan_id', req.params.loanId)
    .limit(1)
    .maybeSingle()

  if (!commitment) { res.status(404).json({ error: 'Loan not found' }); return }
  const loanJoin = commitment.loans as {
    id: string
    payment_channel?: string
    status: string
    interest_rate?: number
    total_repayment?: number
  } | Array<{
    id: string
    payment_channel?: string
    status: string
    interest_rate?: number
    total_repayment?: number
  }>
  const loan = Array.isArray(loanJoin) ? loanJoin[0] : loanJoin
  if (!loan || loan.payment_channel !== 'instapay') {
    res.status(400).json({ error: 'This loan is paid through the app wallet' })
    return
  }
  if (['completed', 'cancelled', 'rejected'].includes(loan.status)) {
    res.status(400).json({ error: 'This loan is already closed' })
    return
  }

  const { data: schedule, error: scheduleError } = await db
    .from('loan_schedule')
    .select('*')
    .eq('loan_id', req.params.loanId)
    .order('installment_number', { ascending: true })

  if (scheduleError) { res.status(500).json({ error: scheduleError.message }); return }

  const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status) && row.total_due - (row.total_paid ?? 0) > 0)
  const targets = schedule_id ? open.filter(row => row.id === schedule_id) : open
  if (schedule_id && !targets.length) {
    res.status(404).json({ error: 'That payment is already recorded' })
    return
  }
  const outstanding = targets.reduce((sum, row) => sum + (row.total_due - (row.total_paid ?? 0)), 0)
  if (outstanding <= 0) {
    res.status(400).json({ error: 'This loan is already paid' })
    return
  }

  const payMode = mode ?? (schedule_id ? 'installment' : 'partial')
  let interestSaved = 0
  let advanceInterestRoom = Number.POSITIVE_INFINITY
  if (payMode === 'advance') {
    const quote = quoteAdvance(open, Number(loan.interest_rate ?? 0))
    const requested = amount == null ? (quote?.payoff_amount ?? 0) : Math.round(amount)
    if (!quote || requested <= 0) {
      res.status(400).json({ error: 'Enter the advance amount' })
      return
    }
    if (requested > quote.payoff_amount) {
      res.status(400).json({ error: 'That is more than the early payoff' })
      return
    }
    interestSaved = amount == null || requested >= quote.payoff_amount
      ? quote.interest_saved
      : partialAdvanceSavings(open, Number(loan.interest_rate ?? 0), requested)
    advanceInterestRoom = amount == null || requested >= quote.payoff_amount
      ? quote.interest_due_today
      : Math.min(requested, quote.interest_due_today)
    interestSaved = reduceScheduleInterest(open, interestSaved)
    for (const row of open) {
      const { error: cutError } = await db.from('loan_schedule').update({
        interest_due: row.interest_due,
        total_due: row.total_due,
      }).eq('id', row.id)
      if (cutError) { res.status(500).json({ error: cutError.message }); return }
    }
    if (interestSaved > 0) {
      await db.from('loans').update({
        total_repayment: Math.max(0, (loan.total_repayment ?? 0) - interestSaved),
      }).eq('id', req.params.loanId)
      const share = Number(commitment.share_percent ?? 100) / 100
      await db.from('funding_commitments').update({
        expected_yield: Math.max(0, (commitment.expected_yield ?? 0) - Math.round(interestSaved * share)),
      }).eq('id', commitment.id)
    }
  }

  const payRows = payMode === 'advance' ? open : targets
  const outstandingNow = payRows.reduce((sum, row) => sum + (row.total_due - (row.total_paid ?? 0)), 0)
  const payAmount = payMode === 'partial' || (payMode === 'advance' && amount != null)
    ? Math.round(amount ?? 0)
    : payMode === 'advance'
      ? outstandingNow
      : outstanding
  if ((payMode === 'partial' || (payMode === 'advance' && amount != null)) && (payAmount <= 0 || payAmount > outstandingNow)) {
    res.status(400).json({ error: 'Enter an amount up to the remaining balance' })
    return
  }

  let left = payAmount
  let interestRecorded = 0
  const now = new Date().toISOString()
  const receivedAt = typeof received_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(received_date)
    ? new Date(`${received_date}T04:00:00Z`).toISOString()
    : now
  const detail = [
    typeof method === 'string' ? method.trim().slice(0, 40) : '',
    typeof paymentNote === 'string' ? paymentNote.trim().slice(0, 200) : '',
  ].filter(Boolean).join(' · ')
  const note = detail || (payMode === 'full' ? 'Paid in full' : payMode === 'advance' ? 'Advance' : 'Partial')

  for (const row of payRows) {
    if (left <= 0) break
    const owed = row.total_due - (row.total_paid ?? 0)
    const interestOwed = Math.max(0, row.interest_due - (row.interest_paid ?? 0))
    const principalRoom = Math.max(0, row.principal_due - (row.principal_paid ?? 0))
    const interestPortion = payMode === 'advance'
      ? Math.min(interestOwed, left, advanceInterestRoom)
      : Math.min(interestOwed, left, owed)
    const principalPortion = payMode === 'advance'
      ? Math.min(principalRoom, left - interestPortion)
      : Math.min(left, owed) - interestPortion
    const apply = interestPortion + principalPortion
    if (apply <= 0) continue
    if (payMode === 'advance') advanceInterestRoom -= interestPortion
    const totalPaid = (row.total_paid ?? 0) + apply
    const settled = totalPaid >= row.total_due
    const { error: payError } = await db.from('loan_schedule').update({
      status: settled ? 'paid' : 'partial',
      principal_paid: (row.principal_paid ?? 0) + principalPortion,
      interest_paid: (row.interest_paid ?? 0) + interestPortion,
      total_paid: totalPaid,
      paid_at: receivedAt,
      payment_note: note,
    }).eq('id', row.id)
    if (payError) { res.status(500).json({ error: payError.message }); return }

    await db.from('yield_distributions').insert({
      commitment_id: commitment.id,
      schedule_id: row.id,
      principal_return: principalPortion,
      interest_return: interestPortion,
      total_return: apply,
    })
    interestRecorded += interestPortion
    left -= apply
  }

  const { data: stillOpen } = await db
    .from('loan_schedule')
    .select('id, total_due, total_paid, status')
    .eq('loan_id', req.params.loanId)

  const done = (stillOpen ?? []).every(row => ['paid', 'waived'].includes(row.status) || (row.total_paid ?? 0) >= row.total_due)
  await db.from('funding_commitments').update({
    actual_yield: (commitment.actual_yield ?? 0) + interestRecorded,
    status: done ? 'completed' : 'repaying',
  }).eq('id', commitment.id)
  await db.from('loans').update({ status: done ? 'completed' : 'repaying' }).eq('id', req.params.loanId)

  res.json({ success: true, applied: payAmount - left, interest_saved: interestSaved, loan_status: done ? 'completed' : 'repaying' })
})

router.post('/loans/:loanId/extend', async (req: Request, res: Response): Promise<void> => {
  const lender = res.locals.user
  const { due_date } = req.body as { due_date?: string }
  if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    res.status(400).json({ error: 'Choose a new due date' })
    return
  }

  const db = supabaseAdmin()
  const { data: commitment } = await db
    .from('funding_commitments')
    .select('id, expected_yield, loans!inner(id, interest_rate, payment_channel, status, total_repayment)')
    .eq('lender_id', lender.id)
    .eq('loan_id', req.params.loanId)
    .limit(1)
    .maybeSingle()

  if (!commitment) { res.status(404).json({ error: 'Loan not found' }); return }
  const loanJoin = commitment.loans as {
    id: string
    interest_rate: number
    payment_channel?: string
    status: string
    total_repayment: number
  } | Array<{
    id: string
    interest_rate: number
    payment_channel?: string
    status: string
    total_repayment: number
  }>
  const loan = Array.isArray(loanJoin) ? loanJoin[0] : loanJoin
  if (!loan || loan.payment_channel !== 'instapay') {
    res.status(400).json({ error: 'Only tracked loans can have their due date extended here' })
    return
  }
  if (['completed', 'cancelled', 'rejected'].includes(loan.status)) {
    res.status(400).json({ error: 'This loan is already closed' })
    return
  }

  const { data: schedule, error: scheduleError } = await db
    .from('loan_schedule')
    .select('*')
    .eq('loan_id', req.params.loanId)
    .order('installment_number', { ascending: true })
  if (scheduleError) { res.status(500).json({ error: scheduleError.message }); return }

  const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status))
  if (!open.length) { res.status(400).json({ error: 'This loan is already paid' }); return }

  const last = open[open.length - 1]
  const extraDays = Math.round((Date.parse(`${due_date}T00:00:00`) - Date.parse(`${last.due_date}T00:00:00`)) / 86400000)
  if (extraDays <= 0) {
    res.status(400).json({ error: 'The new due date has to be after the current full-payment date' })
    return
  }

  const remainingPrincipal = open.reduce((sum, row) => sum + Math.max(0, row.principal_due - (row.principal_paid ?? 0)), 0)
  const extraInterest = Math.round(remainingPrincipal * Number(loan.interest_rate) * extraDays / 365)

  for (const row of open) {
    const shifted = new Date(`${row.due_date}T00:00:00`)
    shifted.setDate(shifted.getDate() + extraDays)
    const nextDue = shifted.toISOString().split('T')[0]
    const isLast = row.id === last.id
    const { error } = await db.from('loan_schedule').update({
      due_date: nextDue,
      interest_due: row.interest_due + (isLast ? extraInterest : 0),
      total_due: row.total_due + (isLast ? extraInterest : 0),
    }).eq('id', row.id)
    if (error) { res.status(500).json({ error: error.message }); return }
  }

  const newMaturity = new Date(`${last.due_date}T00:00:00`)
  newMaturity.setDate(newMaturity.getDate() + extraDays)
  const maturity = newMaturity.toISOString().split('T')[0]
  await db.from('loans').update({
    total_repayment: (loan.total_repayment ?? 0) + extraInterest,
    maturity_date: maturity,
  }).eq('id', req.params.loanId)
  await db.from('funding_commitments').update({
    expected_yield: (commitment.expected_yield ?? 0) + extraInterest,
  }).eq('id', commitment.id)

  const remaining = open.reduce((sum, row) => sum + Math.max(0, row.total_due - (row.total_paid ?? 0)), 0) + extraInterest
  res.json({ extra_days: extraDays, extra_interest: extraInterest, new_due_date: maturity, new_amount: remaining })
})

router.post('/commitments/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const lender = res.locals.user
  const { reason } = req.body as { reason?: string }
  const db = supabaseAdmin()

  const { data: commitment } = await db
    .from('funding_commitments')
    .select('loan_id, status')
    .eq('id', req.params.id)
    .eq('lender_id', lender.id)
    .single()

  if (!commitment) { res.status(404).json({ error: 'Commitment not found' }); return }

  const { data: loan } = await db
    .from('loans')
    .select('status')
    .eq('id', commitment.loan_id)
    .single()

  if (!loan) { res.status(404).json({ error: 'Loan not found' }); return }

  const terminal = ['completed', 'cancelled', 'rejected', 'defaulted']
  if (terminal.includes(loan.status)) {
    res.status(400).json({ error: 'This loan can no longer be cancelled' }); return
  }

  await db.from('loans').update({
    status: 'cancelled',
    rejection_reason: reason ?? null,
  }).eq('id', commitment.loan_id)

  await db.from('funding_commitments').update({ status: 'completed' }).eq('id', req.params.id)

  res.json({ success: true })
})

export default router
