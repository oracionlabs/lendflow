import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/profile', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('borrower_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ profile: data })
})

router.put('/profile', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const allowed = [
    'date_of_birth', 'address_line1', 'address_line2', 'city', 'state',
    'zip', 'country', 'employment_status', 'employer', 'job_title',
    'annual_income', 'monthly_expenses', 'credit_score_range',
  ]
  const updates = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await db
    .from('borrower_profiles')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ profile: data })
})

router.get('/profile/completion', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data: profile } = await db
    .from('borrower_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const { data: docs } = await db
    .from('documents')
    .select('type, status')
    .eq('user_id', user.id)

  const fields = [
    'date_of_birth', 'address_line1', 'city', 'state', 'zip',
    'employment_status', 'annual_income', 'monthly_expenses', 'credit_score_range',
  ]
  const profileScore = profile
    ? fields.filter(f => profile[f as keyof typeof profile] != null).length / fields.length
    : 0

  const hasId = docs?.some(d => d.type === 'government_id') ?? false
  const hasIncome = docs?.some(d => d.type === 'proof_of_income') ?? false
  const docScore = (hasId ? 0.5 : 0) + (hasIncome ? 0.5 : 0)

  const completion = Math.round((profileScore * 0.7 + docScore * 0.3) * 100)
  res.json({ completion, canApply: completion >= 80 })
})

router.post('/documents', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { type, file_url, file_name } = req.body as {
    type: string
    file_url: string
    file_name?: string
  }

  if (!type || !file_url) {
    res.status(400).json({ error: 'type and file_url are required' })
    return
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

router.get('/documents', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ documents: data })
})

export default router
