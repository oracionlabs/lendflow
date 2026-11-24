import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function ensureLoanAccess(db: SupabaseClient, borrowerId: string, lenderId: string): Promise<string> {
  const { data: existing } = await db
    .from('loan_access')
    .select('token')
    .eq('borrower_id', borrowerId)
    .eq('lender_id', lenderId)
    .maybeSingle()

  if (existing?.token) return existing.token as string

  const token = crypto.randomBytes(24).toString('base64url')
  const { error } = await db.from('loan_access').insert({
    token,
    borrower_id: borrowerId,
    lender_id: lenderId,
  })

  if (!error) return token

  const { data: again } = await db
    .from('loan_access')
    .select('token')
    .eq('borrower_id', borrowerId)
    .eq('lender_id', lenderId)
    .maybeSingle()

  if (again?.token) return again.token as string
  throw error
}
