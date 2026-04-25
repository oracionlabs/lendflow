import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, name, role } = req.body as {
    email: string
    password: string
    name: string
    role: 'borrower' | 'lender'
  }

  if (!email || !password || !name || !role) {
    res.status(400).json({ error: 'email, password, name, and role are required' })
    return
  }

  if (!['borrower', 'lender'].includes(role)) {
    res.status(400).json({ error: 'role must be borrower or lender' })
    return
  }

  const db = supabaseAdmin()

  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { name, role },
  })

  if (authError || !authData.user) {
    res.status(400).json({ error: authError?.message ?? 'Failed to create auth user' })
    return
  }

  const { error: rpcError } = await db.rpc('register_user', {
    p_auth_id: authData.user.id,
    p_email: email,
    p_name: name,
    p_role: role,
  })

  if (rpcError) {
    await db.auth.admin.deleteUser(authData.user.id)
    res.status(500).json({ error: 'Failed to set up user profile' })
    return
  }

  const { data: user } = await db.from('users').select('*').eq('id', authData.user.id).single()

  res.status(201).json({ user })
})

router.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({ user: res.locals.user })
})

export default router
