import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { unread_only } = req.query as { unread_only?: string }
  const db = supabaseAdmin()

  let query = db
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (unread_only === 'true') query = query.eq('read', false)

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ notifications: data, total: count })
})

router.put('/:id/read', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  await db
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', user.id)

  res.json({ success: true })
})

router.put('/read-all', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  await db
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('read', false)

  res.json({ success: true })
})

router.get('/preferences', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ preferences: data })
})

router.put('/preferences', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const allowed = [
    'loan_status_in_app', 'loan_status_email',
    'payment_due_in_app', 'payment_due_email',
    'yield_received_in_app', 'yield_received_email',
    'system_in_app', 'system_email',
  ]
  const updates = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await db
    .from('notification_preferences')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ preferences: data })
})

export default router
