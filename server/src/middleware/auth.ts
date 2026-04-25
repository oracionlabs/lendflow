import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin, supabaseWithToken } from '../lib/supabase'
import type { User } from '@lendflow/shared'

declare global {
  namespace Express {
    interface Locals {
      user: User
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  const supabase = supabaseWithToken(token)
  const { data: { user: authUser }, error } = await supabase.auth.getUser()

  if (error || !authUser) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  const db = supabaseAdmin()
  const { data: user, error: userError } = await db
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (userError || !user) {
    res.status(401).json({ error: 'User not found' })
    return
  }

  if (user.status === 'suspended') {
    res.status(403).json({ error: 'Account suspended' })
    return
  }

  res.locals.user = user as User
  next()
}
