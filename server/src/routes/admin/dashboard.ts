import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../lib/supabase'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

  const [
    { count: totalLoans },
    { count: activeLoans },
    { count: pendingApps },
    { count: totalBorrowers },
    { count: totalLenders },
    { count: newBorrowers },
    { count: newLenders },
    { data: activeLoansData },
    { data: recentFees },
  ] = await Promise.all([
    db.from('loans').select('*', { count: 'exact', head: true }).not('status', 'in', '("draft","cancelled")'),
    db.from('loans').select('*', { count: 'exact', head: true }).in('status', ['active', 'repaying']),
    db.from('loans').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'borrower'),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'lender'),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'borrower').gte('created_at', startOfMonth),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'lender').gte('created_at', startOfMonth),
    db.from('loans').select('approved_amount, origination_fee').in('status', ['active', 'repaying', 'completed']),
    db.from('transactions').select('amount').eq('type', 'origination_fee').gte('created_at', startOfMonth),
  ])

  const totalOutstanding = activeLoansData?.reduce((s, l) => s + (l.approved_amount ?? 0), 0) ?? 0
  const totalFees = recentFees?.reduce((s, t) => s + Math.abs(t.amount), 0) ?? 0

  const { data: defaultedLoans } = await db
    .from('loans')
    .select('ai_credit_grade, admin_override_grade')
    .eq('status', 'defaulted')

  const { data: fundedLoans } = await db
    .from('loans')
    .select('id, created_at, fully_funded_at')
    .not('fully_funded_at', 'is', null)

  const avgTimeToFund = fundedLoans?.length
    ? fundedLoans.reduce((s, l) => {
        const diff = new Date(l.fully_funded_at!).getTime() - new Date(l.created_at).getTime()
        return s + diff / (1000 * 60 * 60 * 24)
      }, 0) / fundedLoans.length
    : 0

  const nplRate = (totalLoans ?? 0) > 0
    ? ((defaultedLoans?.length ?? 0) / (totalLoans ?? 1)) * 100
    : 0

  // Alerts
  const { data: approachingDefault } = await db
    .from('loans')
    .select('id, borrower_id')
    .in('status', ['active', 'repaying'])

  const { data: stalePending } = await db
    .from('loans')
    .select('id')
    .in('status', ['submitted', 'under_review'])
    .lt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

  const { data: staleFunding } = await db
    .from('loans')
    .select('id')
    .eq('status', 'funding')
    .lt('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

  res.json({
    origination: {
      total_loans: totalLoans ?? 0,
      total_outstanding: totalOutstanding,
      pending_applications: pendingApps ?? 0,
    },
    npl_rate: parseFloat(nplRate.toFixed(2)),
    avg_time_to_fund_days: parseFloat(avgTimeToFund.toFixed(1)),
    revenue: { origination_fees_this_month: totalFees },
    users: {
      total_borrowers: totalBorrowers ?? 0,
      total_lenders: totalLenders ?? 0,
      new_borrowers_this_month: newBorrowers ?? 0,
      new_lenders_this_month: newLenders ?? 0,
    },
    active_loans: activeLoans ?? 0,
    alerts: {
      stale_pending_count: stalePending?.length ?? 0,
      stale_funding_count: staleFunding?.length ?? 0,
    },
  })
})

export default router
