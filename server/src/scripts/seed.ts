import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { calculateAmortization } from '../lib/amortization'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SEED_PASSWORD = 'Lendflow123!'

interface SeedUser { id: string; email: string; name: string }

async function createUser(email: string, name: string, role: 'borrower' | 'lender' | 'admin'): Promise<SeedUser> {
  const { data, error } = await db.auth.admin.createUser({
    email, password: SEED_PASSWORD, email_confirm: true,
    user_metadata: { name, role },
  })
  if (error || !data.user) throw new Error(`Auth create failed for ${email}: ${error?.message}`)
  const { error: rpcErr } = await db.rpc('register_user', {
    p_auth_id: data.user.id, p_email: email, p_name: name, p_role: role,
  })
  if (rpcErr) throw new Error(`register_user failed for ${email}: ${rpcErr.message}`)
  await db.from('users').update({ email_verified: true }).eq('id', data.user.id)
  return { id: data.user.id, email, name }
}

async function getWallet(userId: string) {
  const { data } = await db.from('wallets')
    .select('id, available_balance, committed_balance, total_yield_earned')
    .eq('user_id', userId).single()
  if (!data) throw new Error(`No wallet for ${userId}`)
  return data
}

function monthsAgo(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setDate(1)
  return d
}

function dateStr(d: Date) { return d.toISOString().split('T')[0] }

// Create a lender listing
async function createListing(lenderId: string, opts: {
  availableAmount: number
  minLoan: number
  maxLoan: number
  interestRate: number
  ratePeriod: string
  acceptedPurposes: string[]
  maxTermMonths: number | null
  description: string
  packages?: Array<{
    name: string
    repayment_type: string
    interest_rate: number
    rate_period: string
    term_months?: number
    max_term_days?: number
    payment_frequency?: string
    description?: string
  }>
}) {
  const { data, error } = await db.from('lender_listings').insert({
    lender_id: lenderId,
    available_amount: opts.availableAmount,
    min_loan: opts.minLoan,
    max_loan: opts.maxLoan,
    interest_rate: opts.interestRate,
    rate_period: opts.ratePeriod,
    accepted_purposes: opts.acceptedPurposes,
    max_term_months: opts.maxTermMonths,
    description: opts.description,
    status: 'active',
  }).select().single()
  if (error || !data) throw new Error(`Listing create failed: ${error?.message}`)

  if (opts.packages?.length) {
    const { error: pkgErr } = await db.from('listing_packages').insert(
      opts.packages.map((p, i) => ({ listing_id: data.id, sort_order: i, ...p }))
    )
    if (pkgErr) console.warn(`Packages insert warning: ${pkgErr.message}`)
  }

  return data
}

// Create a pending application (borrower applied, not yet reviewed)
async function createPendingRequest(borrowerId: string, listingId: string, opts: {
  amount: number
  purpose: string
  termMonths: number
  description?: string
  status?: 'submitted' | 'under_review'
}) {
  const { data } = await db.from('loans').insert({
    borrower_id: borrowerId,
    listing_id: listingId,
    amount_requested: opts.amount,
    purpose: opts.purpose,
    purpose_description: opts.description ?? null,
    term_months: opts.termMonths,
    repayment_type: 'installments',
    amount_funded: 0,
    funding_percent: 0,
    lender_count: 0,
    status: opts.status ?? 'submitted',
    created_at: new Date(Date.now() - Math.random() * 3 * 86400000).toISOString(),
  }).select().single()
  return data
}

// Create a rejected application
async function createRejectedLoan(borrowerId: string, lenderId: string, listingId: string, opts: {
  amount: number; purpose: string; termMonths: number; reason: string
}) {
  await db.from('loans').insert({
    borrower_id: borrowerId,
    listing_id: listingId,
    amount_requested: opts.amount,
    purpose: opts.purpose,
    term_months: opts.termMonths,
    repayment_type: 'installments',
    amount_funded: 0,
    funding_percent: 0,
    lender_count: 0,
    status: 'rejected',
    rejection_reason: opts.reason,
    reviewed_by: lenderId,
    reviewed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  })
}

// Create an active loan with payment history
async function createActiveLoan(opts: {
  borrowerId: string
  lenderId: string
  listingId: string
  purpose: string
  amount: number
  termMonths: number
  interestRate: number
  paymentsAlreadyMade: number
  startedMonthsAgo: number
  finalStatus: 'active' | 'repaying' | 'completed' | 'defaulted'
  missedAfter?: number
}) {
  const { borrowerId, lenderId, listingId, purpose, amount, termMonths, interestRate,
    paymentsAlreadyMade, startedMonthsAgo, finalStatus, missedAfter = 0 } = opts

  const firstPayment = monthsAgo(startedMonthsAgo)
  const disbursedAt = new Date(firstPayment)
  disbursedAt.setMonth(disbursedAt.getMonth() - 1)
  const maturityDate = new Date(firstPayment)
  maturityDate.setMonth(maturityDate.getMonth() + termMonths - 1)

  const amort = calculateAmortization(amount, interestRate, termMonths, dateStr(firstPayment))
  const totalInterest = amort.total_repayment - amount

  // Create loan as active
  const { data: loan } = await db.from('loans').insert({
    borrower_id: borrowerId,
    listing_id: listingId,
    amount_requested: amount,
    purpose,
    term_months: termMonths,
    approved_amount: amount,
    interest_rate: interestRate,
    monthly_payment: amort.monthly_payment,
    total_repayment: amort.total_repayment,
    origination_fee: 0,
    origination_fee_percent: 0,
    repayment_type: 'installments',
    amount_funded: amount,
    funding_percent: 100,
    lender_count: 1,
    fully_funded_at: disbursedAt.toISOString(),
    status: finalStatus,
    reviewed_by: lenderId,
    reviewed_at: disbursedAt.toISOString(),
    disbursed_at: disbursedAt.toISOString(),
    first_payment_date: dateStr(firstPayment),
    maturity_date: dateStr(maturityDate),
  }).select().single()

  if (!loan) throw new Error('Loan insert failed')

  // Funding commitment (100% — lender funded the whole thing)
  const { data: commitment } = await db.from('funding_commitments').insert({
    lender_id: lenderId,
    loan_id: loan.id,
    amount,
    share_percent: 100,
    expected_yield: totalInterest,
    actual_yield: 0,
    status: finalStatus === 'completed' ? 'completed' : finalStatus === 'defaulted' ? 'non_performing' : 'active',
    funded_at: disbursedAt.toISOString(),
    completed_at: finalStatus === 'completed' ? dateStr(maturityDate) : null,
  }).select().single()

  // Amortization schedule
  const { data: schedule } = await db.from('loan_schedule').insert(
    amort.schedule.map(row => ({
      loan_id: loan.id,
      installment_number: row.installment_number,
      due_date: row.due_date,
      principal_due: row.principal_due,
      interest_due: row.interest_due,
      total_due: row.total_due,
      principal_paid: 0, interest_paid: 0, total_paid: 0,
      late_fee: 0, status: 'upcoming', days_late: 0,
    }))
  ).select()

  if (!schedule) throw new Error('Schedule insert failed')

  // Process paid installments
  let borrowerBalance = 5000000 // borrower wallet starting balance

  for (let i = 0; i < paymentsAlreadyMade && i < schedule.length; i++) {
    const row = schedule[i]
    const paidAt = new Date(row.due_date)

    await db.from('loan_schedule').update({
      principal_paid: row.principal_due, interest_paid: row.interest_due,
      total_paid: row.total_due, status: 'paid', paid_at: paidAt.toISOString(), days_late: 0,
    }).eq('id', row.id)

    // Borrower debit
    borrowerBalance -= row.total_due
    const borrowerWallet = await getWallet(borrowerId)
    await db.from('wallets').update({ available_balance: Math.max(0, borrowerWallet.available_balance - row.total_due) }).eq('user_id', borrowerId)

    // Lender credit (yield distribution)
    if (commitment) {
      await db.from('yield_distributions').insert({
        commitment_id: commitment.id,
        schedule_id: row.id,
        principal_return: row.principal_due,
        interest_return: row.interest_due,
        total_return: row.total_due,
        distributed_at: paidAt.toISOString(),
      })

      const lw = await getWallet(lenderId)
      await db.from('wallets').update({
        available_balance: lw.available_balance + row.total_due,
        total_yield_earned: lw.total_yield_earned + row.interest_due,
      }).eq('user_id', lenderId)
    }
  }

  // Update commitment actual yield
  if (commitment) {
    const { data: yds } = await db.from('yield_distributions').select('interest_return').eq('commitment_id', commitment.id)
    const actualYield = yds?.reduce((s, y) => s + y.interest_return, 0) ?? 0
    await db.from('funding_commitments').update({ actual_yield: actualYield }).eq('id', commitment.id)
  }

  // Mark missed payments
  for (let i = paymentsAlreadyMade; i < paymentsAlreadyMade + missedAfter && i < schedule.length; i++) {
    const daysLate = Math.max(0, Math.floor((Date.now() - new Date(schedule[i].due_date).getTime()) / 86400000))
    await db.from('loan_schedule').update({ status: 'missed', days_late: daysLate }).eq('id', schedule[i].id)
  }

  // Mark remaining upcoming/due
  for (let i = paymentsAlreadyMade + missedAfter; i < schedule.length; i++) {
    const isDue = new Date(schedule[i].due_date) <= new Date()
    await db.from('loan_schedule').update({ status: isDue ? 'due' : 'upcoming' }).eq('id', schedule[i].id)
  }

  return loan
}

async function main() {
  console.log('🌱 Seeding LendFlow (new model)...\n')

  // Clean existing seed users
  const seedEmails = [
    'admin@lendflow.dev',
    'borrower1@lendflow.dev', 'borrower2@lendflow.dev', 'borrower3@lendflow.dev',
    'borrower4@lendflow.dev', 'borrower5@lendflow.dev',
    'lender1@lendflow.dev', 'lender2@lendflow.dev', 'lender3@lendflow.dev',
    'lender4@lendflow.dev', 'lender5@lendflow.dev',
  ]
  // Get IDs of existing seed users
  const { data: existingUsers } = await db.from('users').select('id').in('email', seedEmails)
  const ids = existingUsers?.map(u => u.id) ?? []

  if (ids.length) {
    console.log(`Cleaning up ${ids.length} existing seed users...`)

    // NULL out reviewed_by / changed_by references before deleting
    await db.from('loans').update({ reviewed_by: null }).in('reviewed_by', ids)
    await db.from('settings_audit').delete().in('changed_by', ids)

    // Get all commitment IDs (lender side + borrower loan side)
    const { data: allCommits } = await db.from('funding_commitments').select('id')
      .or(`lender_id.in.(${ids.join(',')}),loan_id.in.(select id from loans where borrower_id in (${ids.map(i => `'${i}'`).join(',')})  )`)
    // Simpler: get borrower loan ids first
    const { data: borrowerLoans } = await db.from('loans').select('id').in('borrower_id', ids)
    const loanIdList = borrowerLoans?.map(l => l.id) ?? []

    const { data: lenderCommits } = await db.from('funding_commitments').select('id').in('lender_id', ids)
    const { data: loanCommits } = loanIdList.length
      ? await db.from('funding_commitments').select('id').in('loan_id', loanIdList)
      : { data: [] }
    const commitIdList = [...new Set([
      ...(lenderCommits?.map(c => c.id) ?? []),
      ...(loanCommits?.map(c => c.id) ?? []),
    ])]

    // Delete leaf tables first
    if (commitIdList.length) await db.from('yield_distributions').delete().in('commitment_id', commitIdList)
    if (loanIdList.length)   await db.from('loan_schedule').delete().in('loan_id', loanIdList)
    if (commitIdList.length) await db.from('funding_commitments').delete().in('id', commitIdList)
    if (loanIdList.length)   await db.from('loans').delete().in('id', loanIdList)
    await db.from('lender_listings').delete().in('lender_id', ids)
    await db.from('transactions').delete().in('user_id', ids)
    await db.from('notifications').delete().in('user_id', ids)
    await db.from('notification_preferences').delete().in('user_id', ids)
    await db.from('wallets').delete().in('user_id', ids)
    await db.from('users').delete().in('id', ids)
  }

  // Sweep lingering auth accounts
  const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 200 })
  for (const au of authUsers?.users ?? []) {
    if (seedEmails.includes(au.email ?? '')) await db.auth.admin.deleteUser(au.id)
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  console.log('Creating admin...')
  const admin = await createUser('admin@lendflow.dev', 'Alex Admin', 'admin')

  // ── Borrowers ──────────────────────────────────────────────────────────────
  console.log('Creating borrowers...')
  const [b1, b2, b3, b4, b5] = await Promise.all([
    createUser('borrower1@lendflow.dev', 'Sarah Chen', 'borrower'),
    createUser('borrower2@lendflow.dev', 'Marcus Johnson', 'borrower'),
    createUser('borrower3@lendflow.dev', 'Emily Rodriguez', 'borrower'),
    createUser('borrower4@lendflow.dev', 'David Park', 'borrower'),
    createUser('borrower5@lendflow.dev', 'Lisa Thompson', 'borrower'),
  ])

  await db.from('borrower_profiles').update({ employment_status: 'employed', annual_income: 8500000, monthly_expenses: 350000, credit_score_range: 'good', identity_verified: true }).eq('user_id', b1.id)
  await db.from('borrower_profiles').update({ employment_status: 'self_employed', annual_income: 14000000, monthly_expenses: 480000, credit_score_range: 'very_good', identity_verified: true }).eq('user_id', b2.id)
  await db.from('borrower_profiles').update({ employment_status: 'employed', annual_income: 5200000, monthly_expenses: 290000, credit_score_range: 'fair', identity_verified: true }).eq('user_id', b3.id)
  await db.from('borrower_profiles').update({ employment_status: 'employed', annual_income: 4500000, monthly_expenses: 280000, credit_score_range: 'poor', identity_verified: false }).eq('user_id', b4.id)
  await db.from('borrower_profiles').update({ employment_status: 'student', annual_income: 1800000, monthly_expenses: 180000, credit_score_range: 'poor', identity_verified: false }).eq('user_id', b5.id)

  // Give borrowers wallet balance to make repayments
  for (const b of [b1, b2, b3, b4, b5]) {
    const wallet = await getWallet(b.id)
    await db.from('wallets').update({ available_balance: 5000000 }).eq('user_id', b.id)
  }

  // ── Lenders ────────────────────────────────────────────────────────────────
  console.log('Creating lenders...')
  const [l1, l2, l3, l4, l5] = await Promise.all([
    createUser('lender1@lendflow.dev', 'Robert Kim', 'lender'),
    createUser('lender2@lendflow.dev', 'Jennifer Walsh', 'lender'),
    createUser('lender3@lendflow.dev', 'Michael Torres', 'lender'),
    createUser('lender4@lendflow.dev', 'Amanda Foster', 'lender'),
    createUser('lender5@lendflow.dev', 'Christopher Lee', 'lender'),
  ])

  await db.from('lender_profiles').update({ lender_type: 'individual', accredited: true, risk_tolerance: 'conservative', identity_verified: true }).eq('user_id', l1.id)
  await db.from('lender_profiles').update({ lender_type: 'institutional', accredited: true, risk_tolerance: 'moderate', identity_verified: true }).eq('user_id', l2.id)
  await db.from('lender_profiles').update({ lender_type: 'individual', accredited: true, risk_tolerance: 'aggressive', identity_verified: true }).eq('user_id', l3.id)
  await db.from('lender_profiles').update({ lender_type: 'individual', accredited: false, risk_tolerance: 'conservative', identity_verified: true }).eq('user_id', l4.id)
  await db.from('lender_profiles').update({ lender_type: 'individual', accredited: true, risk_tolerance: 'moderate', identity_verified: true }).eq('user_id', l5.id)

  // Lender wallet balances
  const lenderBalances = [7500000, 12000000, 15000000, 5000000, 9000000]
  for (let i = 0; i < 5; i++) {
    const lender = [l1, l2, l3, l4, l5][i]
    await db.from('wallets').update({ available_balance: lenderBalances[i] }).eq('user_id', lender.id)
  }

  // ── Lender Listings ────────────────────────────────────────────────────────
  console.log('Creating lender listings...')

  const listing1 = await createListing(l1.id, {
    availableAmount: 5000000, minLoan: 50000, maxLoan: 1000000,
    interestRate: 0.03, ratePeriod: 'per_15_days',
    acceptedPurposes: ['personal', 'medical', 'education', 'debt_consolidation'],
    maxTermMonths: 12,
    description: 'I lend to responsible borrowers for personal needs. Fast approval, flexible terms. 5 years of private lending.',
    packages: [
      { name: '30-Day Lump Sum', repayment_type: 'lump_sum', interest_rate: 0.05, rate_period: 'flat', term_months: 1, description: 'Single repayment in 30 days. Best for short-term needs.' },
      { name: '6-Month Installments', repayment_type: 'installments', interest_rate: 0.03, rate_period: 'monthly', term_months: 6, description: 'Fixed monthly payments over 6 months.' },
      { name: '12-Month Installments', repayment_type: 'installments', interest_rate: 0.03, rate_period: 'monthly', term_months: 12, description: 'Spread repayment over a full year.' },
    ],
  })

  const listing2 = await createListing(l2.id, {
    availableAmount: 10000000, minLoan: 100000, maxLoan: 5000000,
    interestRate: 0.05, ratePeriod: 'monthly',
    acceptedPurposes: ['business', 'home_improvement', 'auto'],
    maxTermMonths: 60,
    description: 'Institutional lender. We fund business loans and home improvements. Professional underwriting, competitive rates.',
    packages: [
      { name: 'Standard Business', repayment_type: 'installments', interest_rate: 0.05, rate_period: 'monthly', term_months: 24, description: 'Fixed monthly payments over 2 years.' },
      { name: 'Interest-Only Bridge', repayment_type: 'interest_only', interest_rate: 0.04, rate_period: 'monthly', term_months: 12, description: 'Pay interest monthly, principal at end. Good for cash flow.' },
      { name: 'Long-Term Growth', repayment_type: 'installments', interest_rate: 0.045, rate_period: 'monthly', term_months: 48, description: 'Lower payments spread over 4 years.' },
    ],
  })

  const listing3 = await createListing(l3.id, {
    availableAmount: 8000000, minLoan: 20000, maxLoan: 2000000,
    interestRate: 0.08, ratePeriod: 'monthly',
    acceptedPurposes: [],
    maxTermMonths: 24,
    description: 'Open to all purposes. Higher rate but fast approval — I can turn around a decision in 24 hours.',
    packages: [
      { name: 'Daily Rate (Flexible)', repayment_type: 'daily_interest', interest_rate: 0.003, rate_period: 'daily', max_term_days: 90, description: 'Repay any time within 90 days. Interest accrues daily.' },
      { name: '3-Month Lump Sum', repayment_type: 'lump_sum', interest_rate: 0.08, rate_period: 'monthly', term_months: 3, description: 'Full repayment after 3 months.' },
      { name: '12-Month Installments', repayment_type: 'installments', interest_rate: 0.08, rate_period: 'monthly', term_months: 12, description: 'Standard monthly payments.' },
    ],
  })

  const listing4 = await createListing(l4.id, {
    availableAmount: 3000000, minLoan: 10000, maxLoan: 500000,
    interestRate: 0.02, ratePeriod: 'per_30_days',
    acceptedPurposes: ['personal', 'education', 'medical'],
    maxTermMonths: 6,
    description: 'Small short-term loans only. I prefer to work with people I know or who come with a referral.',
    packages: [
      { name: 'Quick 30-Day', repayment_type: 'lump_sum', interest_rate: 0.02, rate_period: 'per_30_days', term_months: 1, description: 'Repay in full after 30 days.' },
      { name: '3-Month Bi-Weekly', repayment_type: 'custom_schedule', interest_rate: 0.024, rate_period: 'annually', term_months: 3, payment_frequency: 'bi_weekly', description: 'Bi-weekly payments over 3 months.' },
    ],
  })

  const listing5 = await createListing(l5.id, {
    availableAmount: 6000000, minLoan: 50000, maxLoan: 2000000,
    interestRate: 0.12, ratePeriod: 'flat',
    acceptedPurposes: ['business', 'auto', 'home_improvement', 'personal'],
    maxTermMonths: 36,
    description: 'Flat rate — no surprises. You know exactly what you owe from day one. Min 6 months, max 3 years.',
    packages: [
      { name: '6-Month Flat', repayment_type: 'installments', interest_rate: 0.12, rate_period: 'flat', term_months: 6, description: '12% flat on principal, paid monthly over 6 months.' },
      { name: '12-Month Flat', repayment_type: 'installments', interest_rate: 0.12, rate_period: 'flat', term_months: 12, description: '12% flat over a year. Good for bigger amounts.' },
      { name: '36-Month Flat', repayment_type: 'installments', interest_rate: 0.12, rate_period: 'flat', term_months: 36, description: 'Max term option with lowest monthly payment.' },
    ],
  })

  // ── Active / Repaying Loans ────────────────────────────────────────────────
  console.log('Creating active loans...')

  // Sarah took a personal loan from Robert (3%/15days, 6 months, 5 payments made)
  await createActiveLoan({
    borrowerId: b1.id, lenderId: l1.id, listingId: listing1.id,
    purpose: 'personal', amount: 300000, termMonths: 6, interestRate: 0.03 * 2, // 3% per 15d = ~6% monthly
    paymentsAlreadyMade: 4, startedMonthsAgo: 4, finalStatus: 'repaying',
  })

  // Marcus took a business loan from Jennifer (5%/month, 24 months, 10 payments made)
  await createActiveLoan({
    borrowerId: b2.id, lenderId: l2.id, listingId: listing2.id,
    purpose: 'business', amount: 2000000, termMonths: 24, interestRate: 0.05 * 12,
    paymentsAlreadyMade: 10, startedMonthsAgo: 10, finalStatus: 'repaying',
  })

  // Emily took a medical loan from Michael (8%/month, 3 months, 2 paid)
  await createActiveLoan({
    borrowerId: b3.id, lenderId: l3.id, listingId: listing3.id,
    purpose: 'medical', amount: 150000, termMonths: 3, interestRate: 0.08 * 12,
    paymentsAlreadyMade: 2, startedMonthsAgo: 2, finalStatus: 'repaying',
  })

  // Sarah also took a home improvement loan from Jennifer (completed)
  await createActiveLoan({
    borrowerId: b1.id, lenderId: l2.id, listingId: listing2.id,
    purpose: 'home_improvement', amount: 500000, termMonths: 6, interestRate: 0.05 * 12,
    paymentsAlreadyMade: 6, startedMonthsAgo: 7, finalStatus: 'completed',
  })

  // David had a personal loan from Michael — defaulted
  await createActiveLoan({
    borrowerId: b4.id, lenderId: l3.id, listingId: listing3.id,
    purpose: 'personal', amount: 200000, termMonths: 4, interestRate: 0.08 * 12,
    paymentsAlreadyMade: 1, missedAfter: 3, startedMonthsAgo: 4, finalStatus: 'defaulted',
  })

  // Christopher funded Lisa a flat-rate auto loan (completed)
  await createActiveLoan({
    borrowerId: b5.id, lenderId: l5.id, listingId: listing5.id,
    purpose: 'auto', amount: 800000, termMonths: 12, interestRate: 0.12 / 12,
    paymentsAlreadyMade: 12, startedMonthsAgo: 13, finalStatus: 'completed',
  })

  // ── Pending Requests ───────────────────────────────────────────────────────
  console.log('Creating pending requests...')

  // Marcus wants a bigger business loan from Jennifer (under review)
  await createPendingRequest(b2.id, listing2.id, {
    amount: 3000000, purpose: 'business', termMonths: 36,
    description: 'Expanding my consulting practice — need capital for a new office and equipment.',
    status: 'under_review',
  })

  // Emily is asking Robert for education funding (submitted)
  await createPendingRequest(b3.id, listing1.id, {
    amount: 200000, purpose: 'education', termMonths: 12,
    description: 'Professional certification program.',
    status: 'submitted',
  })

  // Lisa is asking Amanda for a personal loan (submitted, just arrived)
  await createPendingRequest(b5.id, listing4.id, {
    amount: 80000, purpose: 'personal', termMonths: 3,
    description: 'Emergency expense, will repay quickly.',
    status: 'submitted',
  })

  // David is asking Christopher for a car loan (submitted)
  await createPendingRequest(b4.id, listing5.id, {
    amount: 600000, purpose: 'auto', termMonths: 12,
    description: 'Buying a secondhand car for work.',
    status: 'submitted',
  })

  // Sarah asking Michael for debt consolidation (under review)
  await createPendingRequest(b1.id, listing3.id, {
    amount: 500000, purpose: 'debt_consolidation', termMonths: 6,
    description: 'Want to consolidate two smaller debts into one.',
    status: 'under_review',
  })

  // ── Rejected Requests ──────────────────────────────────────────────────────
  console.log('Creating rejected requests...')

  await createRejectedLoan(b4.id, l1.id, listing1.id, {
    amount: 800000, purpose: 'personal', termMonths: 12,
    reason: 'Amount exceeds my maximum loan size of $10,000 for personal loans.',
  })

  await createRejectedLoan(b5.id, l2.id, listing2.id, {
    amount: 200000, purpose: 'personal', termMonths: 6,
    reason: 'We only fund business, home improvement, and auto loans.',
  })

  // ── Platform settings ──────────────────────────────────────────────────────
  const { count } = await db.from('platform_settings').select('*', { count: 'exact', head: true })
  if (!count) await db.from('platform_settings').insert({})

  console.log('\n✅ Seed complete!\n')
  console.log('Login credentials  (password: Lendflow123!)')
  console.log('────────────────────────────────────────────────────────────────')
  console.log('Admin:      admin@lendflow.dev')
  console.log()
  console.log('Lenders:')
  console.log('  lender1@lendflow.dev  Robert Kim       — 3% per 15 days, personal/medical')
  console.log('  lender2@lendflow.dev  Jennifer Walsh   — 5% monthly, business/home (institutional)')
  console.log('  lender3@lendflow.dev  Michael Torres   — 8% monthly, all purposes, fast approval')
  console.log('  lender4@lendflow.dev  Amanda Foster    — 2% per 30 days, small short-term only')
  console.log('  lender5@lendflow.dev  Christopher Lee  — 12% flat rate, 6mo–3yr')
  console.log()
  console.log('Borrowers:')
  console.log('  borrower1@lendflow.dev  Sarah Chen      — active loan + completed + pending request')
  console.log('  borrower2@lendflow.dev  Marcus Johnson  — active loan + pending request')
  console.log('  borrower3@lendflow.dev  Emily Rodriguez — active loan + pending request')
  console.log('  borrower4@lendflow.dev  David Park      — defaulted loan + rejected + pending')
  console.log('  borrower5@lendflow.dev  Lisa Thompson   — completed loan + rejected + pending')
  console.log('────────────────────────────────────────────────────────────────')
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
