import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ wallet: data })
})

router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { type, from, to, limit = '50', page = '1' } = req.query as Record<string, string>
  const db = supabaseAdmin()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let query = db
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1)

  if (type) query = query.eq('type', type)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ transactions: data, total: count })
})

router.post('/deposit', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { amount } = req.body as { amount: number }

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Positive amount required' }); return
  }

  const db = supabaseAdmin()
  const { data, error } = await db.rpc('process_wallet_deposit', {
    p_user_id: user.id,
    p_amount: amount,
  })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.post('/withdraw', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { amount } = req.body as { amount: number }

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Positive amount required' }); return
  }

  const db = supabaseAdmin()
  const { data, error } = await db.rpc('process_wallet_withdrawal', {
    p_user_id: user.id,
    p_amount: amount,
  })

  if (error) {
    if (error.message.includes('INSUFFICIENT_BALANCE')) {
      res.status(400).json({ error: 'Insufficient available balance' })
    } else {
      res.status(500).json({ error: error.message })
    }
    return
  }

  res.json(data)
})

export default router
