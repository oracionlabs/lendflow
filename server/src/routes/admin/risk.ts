import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../lib/supabase'

const router = Router()

router.get('/monitor', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: settings } = await db.from('platform_settings').select('default_threshold_missed, grace_period_days').single()
  const threshold = settings?.default_threshold_missed ?? 3

  const { data: activeLoans } = await db
    .from('loans')
    .select('id, borrower_id, approved_amount, interest_rate, status, first_payment_date')
    .in('status', ['active', 'repaying'])

  const riskyLoans = []

  for (const loan of activeLoans ?? []) {
    const { data: schedule } = await db
      .from('loan_schedule')
      .select('installment_number, due_date, status, total_due')
      .eq('loan_id', loan.id)
      .order('installment_number', { ascending: true })

    const missed = schedule?.filter(s => s.status === 'missed').length ?? 0
    const late = schedule?.filter(s => s.status === 'late').length ?? 0

    if (missed > 0 || late > 0) {
      riskyLoans.push({
        loan_id: loan.id,
        borrower_id: loan.borrower_id,
        approved_amount: loan.approved_amount,
        missed_payments: missed,
        late_payments: late,
        threshold,
        approaching_default: missed >= threshold - 1,
        status: loan.status,
      })
    }
  }

  const { data: defaulted } = await db
    .from('loans')
    .select('ai_credit_grade, admin_override_grade, status')
    .eq('status', 'defaulted')

  const nplByGrade: Record<string, { total: number; defaulted: number }> = {}
  for (const loan of defaulted ?? []) {
    const grade = loan.admin_override_grade ?? loan.ai_credit_grade ?? 'Unknown'
    if (!nplByGrade[grade]) nplByGrade[grade] = { total: 0, defaulted: 0 }
    nplByGrade[grade].defaulted++
  }

  const { data: allLoans } = await db
    .from('loans')
    .select('ai_credit_grade, admin_override_grade')
    .not('status', 'in', '("draft","cancelled","rejected")')

  for (const loan of allLoans ?? []) {
    const grade = loan.admin_override_grade ?? loan.ai_credit_grade ?? 'Unknown'
    if (!nplByGrade[grade]) nplByGrade[grade] = { total: 0, defaulted: 0 }
    nplByGrade[grade].total++
  }

  const nplAnalysis = Object.entries(nplByGrade).map(([grade, { total, defaulted }]) => ({
    grade,
    total,
    defaulted,
    npl_rate: total > 0 ? parseFloat(((defaulted / total) * 100).toFixed(2)) : 0,
  }))

  res.json({
    at_risk_loans: riskyLoans,
    npl_by_grade: nplAnalysis,
  })
})

export default router
