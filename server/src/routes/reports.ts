import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import type { User } from '@lendflow/shared'

const router = Router()

router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user as User
  const { type = 'transactions', year } = req.query as { type?: string; year?: string }
  const db = supabaseAdmin()

  let rows: Record<string, unknown>[] = []

  if (type === 'transactions') {
    let query = db
      .from('transactions')
      .select('created_at, type, amount, balance_after, description, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (year) {
      query = query.gte('created_at', `${year}-01-01`).lt('created_at', `${parseInt(year) + 1}-01-01`)
    }

    const { data } = await query
    rows = (data ?? []).map(r => ({ ...r, amount_dollars: (r.amount as number) / 100 }))
  }

  if (type === 'income_summary' && user.role === 'lender') {
    const { data } = await db
      .from('yield_distributions')
      .select('distributed_at, interest_return, principal_return, total_return, funding_commitments!inner(lender_id, loans(purpose))')
      .eq('funding_commitments.lender_id', user.id)

    rows = (data ?? []).map(r => {
      const fc = r.funding_commitments as { loans?: { purpose?: string } } | null
      return {
        date: r.distributed_at,
        loan_purpose: fc?.loans?.purpose ?? '',
        interest_income: r.interest_return / 100,
        principal_return: r.principal_return / 100,
        total: r.total_return / 100,
      }
    })
  }

  if (!rows.length) {
    res.status(204).end()
    return
  }

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(',')),
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename=lendflow-${type}-${year ?? 'all'}.csv`)
  res.send(csv)
})

export default router
