import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../lib/supabase'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data, error } = await db.from('platform_settings').select('*').single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ settings: data })
})

router.put('/', async (req: Request, res: Response): Promise<void> => {
  const admin = res.locals.user
  const db = supabaseAdmin()

  const allowed = [
    'origination_fee_percent', 'late_fee_flat', 'late_fee_daily_percent',
    'grace_period_days', 'default_threshold_missed',
    'min_loan_amount', 'max_loan_amount', 'min_commitment_amount',
    'supported_terms', 'credit_grade_rates',
  ]

  const updates = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
  )

  if ('origination_fee_percent' in updates && (updates.origination_fee_percent as number) < 0) {
    res.status(400).json({ error: 'Rates cannot be negative' }); return
  }
  if ('min_loan_amount' in updates && 'max_loan_amount' in updates) {
    if ((updates.min_loan_amount as number) >= (updates.max_loan_amount as number)) {
      res.status(400).json({ error: 'min_loan_amount must be less than max_loan_amount' }); return
    }
  }

  const { data: current } = await db.from('platform_settings').select('*').single()

  const { data, error } = await db
    .from('platform_settings')
    .update(updates)
    .eq('id', current?.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }

  const auditRows = Object.entries(updates).map(([field, newVal]) => ({
    changed_by: admin.id,
    field_name: field,
    old_value: String(current?.[field as keyof typeof current] ?? ''),
    new_value: String(newVal),
  }))

  await db.from('settings_audit').insert(auditRows)

  res.json({ settings: data })
})

router.get('/audit', async (_req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('settings_audit')
    .select('*, users!changed_by(name)')
    .order('changed_at', { ascending: false })
    .limit(100)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ audit: data })
})

export default router
