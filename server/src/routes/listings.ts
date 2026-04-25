import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireBorrower, requireLender } from '../middleware/requireRole'

const router = Router()

// Browse all active listings (borrowers)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { purpose, min_amount, max_amount } = req.query as Record<string, string>
  const db = supabaseAdmin()

  let query = db
    .from('lender_listings')
    .select(`
      *,
      users!lender_id (name, avatar_url),
      lender_profiles!lender_id (lender_type, accredited, risk_tolerance)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (min_amount) query = query.gte('max_loan', parseInt(min_amount))
  if (max_amount) query = query.lte('min_loan', parseInt(max_amount))
  if (purpose) query = query.contains('accepted_purposes', [purpose])

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ listings: data })
})

// Get single listing
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('lender_listings')
    .select(`
      *,
      users!lender_id (name, avatar_url),
      lender_profiles!lender_id (lender_type, accredited, risk_tolerance)
    `)
    .eq('id', req.params.id)
    .single()

  if (error || !data) { res.status(404).json({ error: 'Listing not found' }); return }
  res.json({ listing: data })
})

// Lender: get own listing
router.get('/me/listing', requireLender, async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data } = await db
    .from('lender_listings')
    .select('*')
    .eq('lender_id', user.id)
    .maybeSingle()

  res.json({ listing: data ?? null })
})

// Lender: create or update listing (upsert — each lender has one listing)
router.post('/me/listing', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const {
    available_amount,
    min_loan,
    max_loan,
    interest_rate,
    rate_period,
    accepted_purposes,
    max_term_months,
    description,
    status,
  } = req.body as {
    available_amount: number
    min_loan?: number
    max_loan?: number
    interest_rate: number
    rate_period: string
    accepted_purposes?: string[]
    max_term_months?: number
    description?: string
    status?: string
  }

  if (!available_amount || !interest_rate || !rate_period) {
    res.status(400).json({ error: 'available_amount, interest_rate, and rate_period are required' })
    return
  }

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('lender_listings')
    .upsert({
      lender_id: user.id,
      available_amount,
      min_loan: min_loan ?? 10000,
      max_loan: max_loan ?? available_amount,
      interest_rate,
      rate_period,
      accepted_purposes: accepted_purposes ?? [],
      max_term_months: max_term_months ?? null,
      description: description ?? null,
      status: status ?? 'active',
    }, { onConflict: 'lender_id' })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ listing: data })
})

// Lender: get requests to their listing
router.get('/me/requests', requireLender, async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db
    .from('lender_listings')
    .select('id')
    .eq('lender_id', user.id)
    .maybeSingle()

  if (!listing) { res.json({ requests: [] }); return }

  const { data, error } = await db
    .from('loans')
    .select(`
      id, amount_requested, purpose, purpose_description, term_months,
      status, created_at, ai_credit_grade, admin_override_grade,
      monthly_payment, interest_rate,
      users!borrower_id (name, email, phone)
    `)
    .eq('listing_id', listing.id)
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ requests: data })
})

// Borrower: apply to a listing
router.post('/:id/apply', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { amount_requested, purpose, purpose_description, term_months, notes } = req.body as {
    amount_requested: number
    purpose: string
    purpose_description?: string
    term_months: number
    notes?: string
  }

  const db = supabaseAdmin()

  const { data: listing } = await db
    .from('lender_listings')
    .select('*')
    .eq('id', req.params.id)
    .eq('status', 'active')
    .single()

  if (!listing) { res.status(404).json({ error: 'Listing not found or no longer active' }); return }

  if (amount_requested < listing.min_loan) {
    res.status(400).json({ error: `Minimum loan is ${listing.min_loan / 100}` }); return
  }
  if (listing.max_loan && amount_requested > listing.max_loan) {
    res.status(400).json({ error: `Maximum loan is ${listing.max_loan / 100}` }); return
  }

  const { data: loan, error } = await db.from('loans').insert({
    borrower_id: user.id,
    listing_id: listing.id,
    amount_requested,
    purpose,
    purpose_description: [purpose_description, notes].filter(Boolean).join(' — ') || undefined,
    term_months,
    interest_rate: listing.interest_rate,
    amount_funded: 0,
    funding_percent: 0,
    lender_count: 0,
    status: 'submitted',
  }).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ loan })
})

// Lender: accept a request
router.post('/me/requests/:loan_id/accept', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.status(404).json({ error: 'No listing found' }); return }

  const { data: loan } = await db.from('loans').select('*').eq('id', req.params.loan_id).eq('listing_id', listing.id).single()
  if (!loan) { res.status(404).json({ error: 'Request not found' }); return }

  const net = loan.amount_requested
  const r = loan.interest_rate / 12
  const monthlyPayment = r === 0
    ? Math.round(net / loan.term_months)
    : Math.round((net * (r * Math.pow(1 + r, loan.term_months))) / (Math.pow(1 + r, loan.term_months) - 1))

  const firstPaymentDate = new Date()
  firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1)
  firstPaymentDate.setDate(1)

  const maturityDate = new Date(firstPaymentDate)
  maturityDate.setMonth(maturityDate.getMonth() + loan.term_months - 1)

  const { data: updated, error } = await db.from('loans').update({
    status: 'approved',
    approved_amount: loan.amount_requested,
    monthly_payment: monthlyPayment,
    total_repayment: monthlyPayment * loan.term_months,
    origination_fee: 0,
    origination_fee_percent: 0,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    first_payment_date: firstPaymentDate.toISOString().split('T')[0],
    maturity_date: maturityDate.toISOString().split('T')[0],
  }).eq('id', req.params.loan_id).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ loan: updated })
})

// Lender: reject a request
router.post('/me/requests/:loan_id/reject', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { reason } = req.body as { reason?: string }
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.status(404).json({ error: 'No listing found' }); return }

  const { error } = await db.from('loans').update({
    status: 'rejected',
    rejection_reason: reason ?? 'Does not meet lending criteria',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', req.params.loan_id).eq('listing_id', listing.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ success: true })
})

export default router
