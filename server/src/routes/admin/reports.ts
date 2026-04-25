import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../lib/supabase'

const router = Router()

// Monthly origination volume (last 12 months)
router.get('/origination', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: loans } = await db
    .from('loans')
    .select('created_at, amount_requested, status, ai_credit_grade, admin_override_grade')
    .not('status', 'in', '("draft","cancelled")')
    .gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString())
    .order('created_at', { ascending: true })

  const monthly: Record<string, { month: string; volume: number; count: number; funded: number }> = {}

  for (const loan of loans ?? []) {
    const month = loan.created_at.slice(0, 7)
    if (!monthly[month]) monthly[month] = { month, volume: 0, count: 0, funded: 0 }
    monthly[month].count++
    monthly[month].volume += loan.amount_requested
    if (!['submitted', 'under_review', 'approved', 'rejected'].includes(loan.status)) {
      monthly[month].funded++
    }
  }

  res.json({ origination: Object.values(monthly) })
})

// NPL rate by credit grade
router.get('/npl', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: loans } = await db
    .from('loans')
    .select('status, ai_credit_grade, admin_override_grade')
    .not('status', 'in', '("draft","cancelled","submitted","under_review")')

  const byGrade: Record<string, { grade: string; total: number; defaulted: number; npl_rate: number }> = {}

  for (const loan of loans ?? []) {
    const grade = loan.admin_override_grade ?? loan.ai_credit_grade ?? 'Unknown'
    if (!byGrade[grade]) byGrade[grade] = { grade, total: 0, defaulted: 0, npl_rate: 0 }
    byGrade[grade].total++
    if (loan.status === 'defaulted') byGrade[grade].defaulted++
  }

  for (const g of Object.values(byGrade)) {
    g.npl_rate = g.total > 0 ? parseFloat(((g.defaulted / g.total) * 100).toFixed(2)) : 0
  }

  const grades = ['A', 'B', 'C', 'D', 'E']
  const sorted = grades.map(g => byGrade[g] ?? { grade: g, total: 0, defaulted: 0, npl_rate: 0 })

  res.json({ npl: sorted })
})

// Revenue over time (origination fees)
router.get('/revenue', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: fees } = await db
    .from('transactions')
    .select('created_at, amount')
    .eq('type', 'origination_fee')
    .gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString())
    .order('created_at', { ascending: true })

  const monthly: Record<string, { month: string; fees: number; cumulative: number }> = {}

  for (const tx of fees ?? []) {
    const month = tx.created_at.slice(0, 7)
    if (!monthly[month]) monthly[month] = { month, fees: 0, cumulative: 0 }
    monthly[month].fees += Math.abs(tx.amount)
  }

  let cumulative = 0
  const result = Object.values(monthly).map(m => {
    cumulative += m.fees
    return { ...m, cumulative }
  })

  res.json({ revenue: result })
})

// Cohort performance: loans by month originated, their outcome
router.get('/cohort', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: loans } = await db
    .from('loans')
    .select('created_at, status, approved_amount')
    .not('status', 'in', '("draft","cancelled","submitted","under_review","approved")')
    .gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString())

  const cohorts: Record<string, {
    month: string; originated: number; completed: number; defaulted: number; active: number; volume: number
  }> = {}

  for (const loan of loans ?? []) {
    const month = loan.created_at.slice(0, 7)
    if (!cohorts[month]) cohorts[month] = { month, originated: 0, completed: 0, defaulted: 0, active: 0, volume: 0 }
    cohorts[month].originated++
    cohorts[month].volume += loan.approved_amount ?? 0
    if (loan.status === 'completed') cohorts[month].completed++
    else if (loan.status === 'defaulted') cohorts[month].defaulted++
    else cohorts[month].active++
  }

  res.json({ cohort: Object.values(cohorts) })
})

export default router
