import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/me', async (_req: Request, res: Response): Promise<void> => {
  res.json({ user: res.locals.user })
})

router.put('/me', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { name, phone } = req.body as { name?: string; phone?: string }

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('users')
    .update({ name, phone })
    .eq('id', user.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ user: data })
})

// Public platform settings — safe fields accessible to all authenticated users
router.get('/platform-settings', async (_req, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data } = await db.from('platform_settings').select('currency').single()
  res.json({ currency: data?.currency ?? 'USD' })
})

export default router
