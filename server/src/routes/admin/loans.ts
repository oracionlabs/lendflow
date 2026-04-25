import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../lib/supabase'
import { calculateAmortization } from '../../lib/amortization'
import { notifyLoanStatusChange } from '../../lib/notifications'
import { CREDIT_GRADE_RATES } from '@lendflow/shared'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { status, page = '1', limit = '20', search } = req.query as Record<string, string>
  const db = supabaseAdmin()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let query = db
    .from('loans')
    .select('*, users!borrower_id(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1)

  if (status) query = query.eq('status', status)
  if (search) query = query.ilike('users.name', `%${search}%`)

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ loans: data, total: count })
})

router.get('/queue', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('loans')
    .select(`
      id, amount_requested, purpose, term_months, ai_credit_grade, ai_confidence,
      ai_reasoning, ai_risk_factors, debt_to_income_ratio, status, created_at,
      borrower_id,
      borrower_profiles!inner(
        employment_status, annual_income, monthly_expenses, credit_score_range, identity_verified
      )
    `)
    .in('status', ['submitted', 'under_review'])
    .order('created_at', { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ queue: data })
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: loan, error } = await db
    .from('loans')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !loan) { res.status(404).json({ error: 'Loan not found' }); return }

  const { data: profile } = await db
    .from('borrower_profiles')
    .select('*')
    .eq('user_id', loan.borrower_id)
    .single()

  const { data: docs } = await db
    .from('documents')
    .select('*')
    .eq('user_id', loan.borrower_id)

  const { data: history } = await db
    .from('loans')
    .select('id, status, amount_requested, created_at')
    .eq('borrower_id', loan.borrower_id)
    .neq('id', req.params.id)
    .order('created_at', { ascending: false })

  res.json({ loan, profile, documents: docs ?? [], history: history ?? [] })
})

router.post('/:id/review', async (req: Request, res: Response): Promise<void> => {
  const admin = res.locals.user
  const { action, approved_amount, interest_rate, funding_deadline, rejection_reason } = req.body as {
    action: 'approve' | 'reject'
    approved_amount?: number
    interest_rate?: number
    funding_deadline?: string
    rejection_reason?: string
  }

  if (!['approve', 'reject'].includes(action)) {
    res.status(400).json({ error: 'action must be approve or reject' }); return
  }

  const db = supabaseAdmin()
  const { data: loan } = await db
    .from('loans')
    .select('*, users!borrower_id(name, email)')
    .eq('id', req.params.id)
    .single()

  if (!loan) { res.status(404).json({ error: 'Loan not found' }); return }
  if (!['submitted', 'under_review'].includes(loan.status)) {
    res.status(400).json({ error: 'Loan is not awaiting review' }); return
  }

  if (action === 'approve') {
    const grade = loan.admin_override_grade ?? loan.ai_credit_grade ?? 'C'
    const rate = interest_rate ?? CREDIT_GRADE_RATES[grade] ?? 0.12
    const amount = approved_amount ?? loan.amount_requested

    const { data: settings } = await db.from('platform_settings').select('origination_fee_percent').single()
    const origFee = Math.round(amount * (settings?.origination_fee_percent ?? 0.02))

    const preview = calculateAmortization(amount, rate, loan.term_months, new Date().toISOString().split('T')[0])

    const deadline = funding_deadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: updated, error } = await db
      .from('loans')
      .update({
        status: 'funding',
        approved_amount: amount,
        interest_rate: rate,
        monthly_payment: preview.monthly_payment,
        total_repayment: preview.total_repayment,
        origination_fee: origFee,
        origination_fee_percent: settings?.origination_fee_percent ?? 0.02,
        funding_deadline: deadline,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) { res.status(500).json({ error: error.message }); return }

    const borrower = loan.users as { name: string; email: string } | null
    if (borrower) {
      await notifyLoanStatusChange(loan.borrower_id, borrower.name, borrower.email, loan.id, 'approved')
    }

    res.json({ loan: updated })
  } else {
    const { data: updated, error } = await db
      .from('loans')
      .update({
        status: 'rejected',
        rejection_reason: rejection_reason ?? 'Application did not meet lending criteria',
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) { res.status(500).json({ error: error.message }); return }

    const borrower = loan.users as { name: string; email: string } | null
    if (borrower) {
      await notifyLoanStatusChange(loan.borrower_id, borrower.name, borrower.email, loan.id, 'rejected', rejection_reason)
    }

    res.json({ loan: updated })
  }
})

router.post('/:id/disburse', async (req: Request, res: Response): Promise<void> => {
  const admin = res.locals.user
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('*, users!borrower_id(name, email)')
    .eq('id', req.params.id)
    .single()

  if (!loan) { res.status(404).json({ error: 'Loan not found' }); return }
  if (loan.status !== 'fully_funded') {
    res.status(400).json({ error: 'Loan must be fully funded before disbursement' }); return
  }

  const firstPaymentDate = new Date()
  firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1)
  const firstPaymentStr = firstPaymentDate.toISOString().split('T')[0]

  const { data: rpcResult, error: rpcError } = await db.rpc('disburse_loan', {
    p_loan_id: req.params.id,
    p_admin_id: admin.id,
    p_first_payment_date: firstPaymentStr,
  })

  if (rpcError) {
    if (rpcError.message.includes('LOAN_NOT_FULLY_FUNDED')) {
      res.status(400).json({ error: 'Loan is not fully funded' })
    } else {
      res.status(500).json({ error: rpcError.message })
    }
    return
  }

  // Generate amortization schedule
  const schedule = calculateAmortization(
    loan.approved_amount,
    loan.interest_rate,
    loan.term_months,
    firstPaymentStr
  )

  const rows = schedule.schedule.map(row => ({
    loan_id: req.params.id,
    installment_number: row.installment_number,
    due_date: row.due_date,
    principal_due: row.principal_due,
    interest_due: row.interest_due,
    total_due: row.total_due,
  }))

  await db.from('loan_schedule').insert(rows)

  const borrower = loan.users as { name: string; email: string } | null
  if (borrower) {
    await notifyLoanStatusChange(loan.borrower_id, borrower.name, borrower.email, loan.id, 'funded and disbursed')
  }

  res.json({ disbursed: rpcResult, schedule_rows: rows.length })
})

router.post('/:id/override-grade', async (req: Request, res: Response): Promise<void> => {
  const admin = res.locals.user
  const { grade, justification } = req.body as { grade: string; justification: string }

  if (!['A', 'B', 'C', 'D', 'E'].includes(grade)) {
    res.status(400).json({ error: 'grade must be A–E' }); return
  }

  if (!justification || justification.trim().length < 10) {
    res.status(400).json({ error: 'Written justification required (min 10 chars)' }); return
  }

  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('ai_credit_grade, admin_override_grade')
    .eq('id', req.params.id)
    .single()

  if (!loan) { res.status(404).json({ error: 'Loan not found' }); return }

  await db.from('loans').update({ admin_override_grade: grade, admin_override_reason: justification }).eq('id', req.params.id)

  await db.from('settings_audit').insert({
    changed_by: admin.id,
    field_name: 'admin_override_grade',
    old_value: loan.admin_override_grade ?? loan.ai_credit_grade,
    new_value: grade,
  })

  res.json({ success: true, grade })
})

export default router
