import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../lib/supabase'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { role, search, status, page = '1', limit = '20' } = req.query as Record<string, string>
  const db = supabaseAdmin()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let query = db
    .from('users')
    .select('id, name, email, role, status, email_verified, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1)

  if (role) query = query.eq('role', role)
  if (status) query = query.eq('status', status)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ users: data, total: count })
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data: user, error } = await db
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !user) { res.status(404).json({ error: 'User not found' }); return }

  let profile = null
  if (user.role === 'borrower') {
    const { data } = await db.from('borrower_profiles').select('*').eq('user_id', req.params.id).single()
    profile = data
  } else if (user.role === 'lender') {
    const { data } = await db.from('lender_profiles').select('*').eq('user_id', req.params.id).single()
    profile = data
  }

  const { data: docs } = await db.from('documents').select('*').eq('user_id', req.params.id)
  const { data: wallet } = await db.from('wallets').select('*').eq('user_id', req.params.id).single()

  res.json({ user, profile, documents: docs ?? [], wallet })
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { status } = req.body as { status?: string }

  if (status && !['active', 'suspended', 'pending_verification'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' }); return
  }

  const { data, error } = await db
    .from('users')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ user: data })
})

router.put('/:id/verify-document', async (req: Request, res: Response): Promise<void> => {
  const { document_id, status, rejection_reason } = req.body as {
    document_id: string
    status: 'verified' | 'rejected'
    rejection_reason?: string
  }

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('documents')
    .update({ status, rejection_reason, reviewed_at: new Date().toISOString() })
    .eq('id', document_id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ document: data })
})

export default router
