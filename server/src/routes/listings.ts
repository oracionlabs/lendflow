import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireBorrower, requireLender } from '../middleware/requireRole'
import {
  calculateAmortization,
  calculateInterestOnly,
  calculateDailyInterest,
  calculateCustomSchedule,
} from '../lib/amortization'
import type { PaymentFrequency } from '@lendflow/shared'

const router = Router()

// ─── Public: browse active listings ──────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { purpose, min_amount, max_amount } = req.query as Record<string, string>
  const db = supabaseAdmin()

  let query = db
    .from('lender_listings')
    .select(`
      *,
      users!lender_id (name, avatar_url, lender_profiles(lender_type, accredited, risk_tolerance))
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (min_amount) query = query.gte('max_loan', parseInt(min_amount))
  if (max_amount) query = query.lte('min_loan', parseInt(max_amount))
  if (purpose) query = query.contains('accepted_purposes', [purpose])

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }

  // Attach package counts separately so missing table doesn't break listing browse
  let listings = data as (typeof data[0] & { listing_packages: { id: string }[] })[]
  try {
    const ids = listings.map(l => l.id)
    if (ids.length) {
      const { data: pkgs } = await db.from('listing_packages').select('id, listing_id').in('listing_id', ids)
      const byListing: Record<string, { id: string }[]> = {}
      for (const p of pkgs ?? []) {
        if (!byListing[p.listing_id]) byListing[p.listing_id] = []
        byListing[p.listing_id].push({ id: p.id })
      }
      listings = listings.map(l => ({ ...l, listing_packages: byListing[l.id] ?? [] }))
    }
  } catch { /* listing_packages table may not exist yet on older deployments */ }

  res.json({ listings })
})

// ─── Public: single listing ───────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('lender_listings')
    .select(`
      *,
      users!lender_id (name, avatar_url, lender_profiles(lender_type, accredited, risk_tolerance)),
      listing_packages(*)
    `)
    .eq('id', req.params.id)
    .single()

  if (error || !data) { res.status(404).json({ error: 'Listing not found' }); return }
  res.json({ listing: data })
})

// ─── Lender: own listing ──────────────────────────────────────────────────────

router.get('/me/listing', requireLender, async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()
  const { data } = await db
    .from('lender_listings')
    .select('*, listing_packages(*)')
    .eq('lender_id', user.id)
    .maybeSingle()

  res.json({ listing: data ?? null })
})

router.post('/me/listing', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const {
    available_amount, min_loan, max_loan, interest_rate, rate_period,
    accepted_purposes, max_term_months, description, currency, status,
  } = req.body as {
    available_amount: number; min_loan?: number; max_loan?: number
    interest_rate: number; rate_period: string; accepted_purposes?: string[]
    max_term_months?: number; description?: string; currency?: string; status?: string
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
      currency: currency ?? 'USD',
      status: status ?? 'active',
    }, { onConflict: 'lender_id' })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ listing: data })
})

// ─── Lender: listing packages CRUD ───────────────────────────────────────────

router.get('/:id/packages', async (req: Request, res: Response): Promise<void> => {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('listing_packages')
    .select('*')
    .eq('listing_id', req.params.id)
    .order('sort_order')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ packages: data })
})

router.post('/:id/packages', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('id', req.params.id).eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.status(403).json({ error: 'Listing not found or not yours' }); return }

  const { name, description, repayment_type, interest_rate, rate_period, term_months, max_term_days, payment_frequency, min_loan, max_loan, sort_order } = req.body

  if (!name || !repayment_type || interest_rate == null || !rate_period) {
    res.status(400).json({ error: 'name, repayment_type, interest_rate, rate_period are required' }); return
  }
  if (['installments', 'interest_only'].includes(repayment_type) && !term_months) {
    res.status(400).json({ error: 'term_months is required for this repayment type' }); return
  }
  if (repayment_type === 'daily_interest' && !max_term_days) {
    res.status(400).json({ error: 'max_term_days is required for daily_interest' }); return
  }
  if (repayment_type === 'custom_schedule' && (!term_months || !payment_frequency)) {
    res.status(400).json({ error: 'term_months and payment_frequency are required for custom_schedule' }); return
  }

  const { data, error } = await db.from('listing_packages').insert({
    listing_id: req.params.id, name, description: description ?? null,
    repayment_type, interest_rate, rate_period,
    term_months: term_months ?? null, max_term_days: max_term_days ?? null,
    payment_frequency: payment_frequency ?? null,
    min_loan: min_loan ?? null, max_loan: max_loan ?? null,
    sort_order: sort_order ?? 0,
  }).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ package: data })
})

router.put('/:id/packages/:pkgId', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('id', req.params.id).eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.status(403).json({ error: 'Listing not found or not yours' }); return }

  const { name, description, repayment_type, interest_rate, rate_period, term_months, max_term_days, payment_frequency, min_loan, max_loan, sort_order } = req.body

  const { data, error } = await db.from('listing_packages')
    .update({ name, description, repayment_type, interest_rate, rate_period, term_months, max_term_days, payment_frequency, min_loan, max_loan, sort_order })
    .eq('id', req.params.pkgId).eq('listing_id', req.params.id)
    .select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ package: data })
})

router.delete('/:id/packages/:pkgId', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('id', req.params.id).eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.status(403).json({ error: 'Listing not found or not yours' }); return }

  const { error } = await db.from('listing_packages').delete().eq('id', req.params.pkgId).eq('listing_id', req.params.id)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ success: true })
})

// ─── Lender: requests on their listing ───────────────────────────────────────

router.get('/me/requests', requireLender, async (_req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.json({ requests: [] }); return }

  const { data, error } = await db
    .from('loans')
    .select(`
      id, amount_requested, purpose, purpose_description, term_months,
      status, created_at, ai_credit_grade, admin_override_grade,
      monthly_payment, interest_rate, repayment_type, package_id,
      users!borrower_id (name, email, phone)
    `)
    .eq('listing_id', listing.id)
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ requests: data })
})

// ─── Borrower: apply to a listing ────────────────────────────────────────────

router.post('/:id/apply', requireBorrower, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { amount_requested, purpose, purpose_description, term_months, notes, package_id } = req.body as {
    amount_requested: number; purpose: string; purpose_description?: string
    term_months?: number; notes?: string; package_id?: string
  }

  const db = supabaseAdmin()

  const { data: listing } = await db
    .from('lender_listings').select('*').eq('id', req.params.id).eq('status', 'active').single()
  if (!listing) { res.status(404).json({ error: 'Listing not found or no longer active' }); return }

  // Resolve package terms if a package was selected
  let pkg: Record<string, unknown> | null = null
  if (package_id) {
    const { data } = await db.from('listing_packages').select('*').eq('id', package_id).eq('listing_id', listing.id).single()
    if (!data) { res.status(404).json({ error: 'Package not found' }); return }
    pkg = data
  }

  const effectiveRate = (pkg?.interest_rate ?? listing.interest_rate) as number
  const effectiveTermMonths = (pkg?.term_months ?? term_months ?? listing.max_term_months) as number | null
  const effectiveRepaymentType = (pkg?.repayment_type ?? 'installments') as string
  const effectiveMinLoan = (pkg?.min_loan ?? listing.min_loan) as number
  const effectiveMaxLoan = (pkg?.max_loan ?? listing.max_loan) as number | null
  const effectiveMaxTermDays = (pkg?.max_term_days ?? null) as number | null
  const effectiveFrequency = (pkg?.payment_frequency ?? null) as PaymentFrequency | null

  if (amount_requested < effectiveMinLoan) {
    res.status(400).json({ error: `Minimum loan is $${(effectiveMinLoan / 100).toFixed(2)}` }); return
  }
  if (effectiveMaxLoan && amount_requested > effectiveMaxLoan) {
    res.status(400).json({ error: `Maximum loan is $${(effectiveMaxLoan / 100).toFixed(2)}` }); return
  }

  const { data: loan, error } = await db.from('loans').insert({
    borrower_id: user.id,
    listing_id: listing.id,
    amount_requested,
    purpose,
    purpose_description: [purpose_description, notes].filter(Boolean).join(' — ') || undefined,
    term_months: effectiveTermMonths ?? term_months,
    interest_rate: effectiveRate,
    repayment_type: effectiveRepaymentType,
    package_id: package_id ?? null,
    payment_frequency: effectiveFrequency,
    max_term_days: effectiveMaxTermDays,
    currency: (listing as Record<string, unknown>).currency as string ?? 'USD',
    amount_funded: 0,
    funding_percent: 0,
    lender_count: 0,
    status: 'submitted',
  }).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ loan })
})

// ─── Lender: accept a request ─────────────────────────────────────────────────

router.post('/me/requests/:loan_id/accept', requireLender, async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: listing } = await db.from('lender_listings').select('id').eq('lender_id', user.id).maybeSingle()
  if (!listing) { res.status(404).json({ error: 'No listing found' }); return }

  const { data: loan } = await db.from('loans').select('*').eq('id', req.params.loan_id).eq('listing_id', listing.id).single()
  if (!loan) { res.status(404).json({ error: 'Request not found' }); return }

  const net = loan.amount_requested
  const repaymentType = loan.repayment_type ?? 'installments'

  const firstPaymentDate = new Date()
  firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1)
  firstPaymentDate.setDate(1)
  const firstPaymentStr = firstPaymentDate.toISOString().split('T')[0]

  let monthlyPayment = 0
  let totalRepayment = net
  let maturityDateStr = firstPaymentStr

  if (repaymentType === 'lump_sum') {
    const mat = new Date(firstPaymentDate)
    mat.setMonth(mat.getMonth() + (loan.term_months ?? 1) - 1)
    maturityDateStr = mat.toISOString().split('T')[0]
    const totalInterest = Math.round(net * loan.interest_rate)
    totalRepayment = net + totalInterest
    monthlyPayment = totalRepayment

  } else if (repaymentType === 'interest_only') {
    const result = calculateInterestOnly(net, loan.interest_rate, loan.term_months, firstPaymentStr)
    monthlyPayment = result.monthly_interest_payment
    totalRepayment = result.total_repayment
    const mat = new Date(firstPaymentDate)
    mat.setMonth(mat.getMonth() + loan.term_months - 1)
    maturityDateStr = mat.toISOString().split('T')[0]

  } else if (repaymentType === 'daily_interest') {
    const maxDays = loan.max_term_days ?? 90
    const dailyRate = loan.interest_rate / 365
    const result = calculateDailyInterest(net, dailyRate, maxDays, firstPaymentStr)
    monthlyPayment = 0
    totalRepayment = result.total_if_full_term
    maturityDateStr = result.schedule[0].due_date

  } else if (repaymentType === 'custom_schedule') {
    const freq = (loan.payment_frequency ?? 'monthly') as PaymentFrequency
    const result = calculateCustomSchedule(net, loan.interest_rate, loan.term_months, freq, firstPaymentStr)
    monthlyPayment = result.monthly_payment
    totalRepayment = result.total_repayment
    const mat = new Date(firstPaymentDate)
    mat.setMonth(mat.getMonth() + loan.term_months - 1)
    maturityDateStr = mat.toISOString().split('T')[0]

  } else {
    // installments (default)
    const result = calculateAmortization(net, loan.interest_rate, loan.term_months, firstPaymentStr)
    monthlyPayment = result.monthly_payment
    totalRepayment = result.total_repayment
    const mat = new Date(firstPaymentDate)
    mat.setMonth(mat.getMonth() + loan.term_months - 1)
    maturityDateStr = mat.toISOString().split('T')[0]
  }

  const { data: updated, error } = await db.from('loans').update({
    status: 'approved',
    approved_amount: net,
    monthly_payment: monthlyPayment,
    total_repayment: totalRepayment,
    origination_fee: 0,
    origination_fee_percent: 0,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    first_payment_date: firstPaymentStr,
    maturity_date: maturityDateStr,
  }).eq('id', req.params.loan_id).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ loan: updated })
})

// ─── Lender: reject a request ─────────────────────────────────────────────────

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
