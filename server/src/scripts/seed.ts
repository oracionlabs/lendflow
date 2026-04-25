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
  const { data } = await db.from('wallets').select('id, available_balance, committed_balance, total_yield_earned').eq('user_id', userId).single()
  if (!data) throw new Error(`No wallet for ${userId}`)
  return data
}

async function depositToWallet(userId: string, amountCents: number, description: string) {
  const wallet = await getWallet(userId)
  const newBalance = wallet.available_balance + amountCents
  await db.from('wallets').update({ available_balance: newBalance }).eq('user_id', userId)
  await db.from('transactions').insert({
    user_id: userId, wallet_id: wallet.id,
    type: 'deposit', amount: amountCents, balance_after: newBalance,
    description, status: 'completed',
  })
}

function monthsAgo(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setDate(1)
  return d
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

async function createActiveLoan(opts: {
  borrowerId: string
  adminId: string
  purpose: string
  amountCents: number
  termMonths: number
  grade: string
  rate: number
  lenders: Array<{ id: string; fraction: number }>
  paymentsAlreadyMade: number
  missedAfter?: number
  startedMonthsAgo: number
  finalStatus: 'repaying' | 'completed' | 'defaulted'
}) {
  const { borrowerId, adminId, purpose, amountCents, termMonths, grade, rate, lenders: lenderList, paymentsAlreadyMade, missedAfter = 0, startedMonthsAgo, finalStatus } = opts

  const originationFee = Math.round(amountCents * 0.02)
  const netPrincipal = amountCents - originationFee
  const firstPayment = monthsAgo(startedMonthsAgo)
  const firstPaymentStr = dateStr(firstPayment)
  const disbursedAt = new Date(firstPayment)
  disbursedAt.setMonth(disbursedAt.getMonth() - 1)
  const fullyFundedAt = new Date(disbursedAt)
  fullyFundedAt.setDate(fullyFundedAt.getDate() - 3)
  const maturityDate = new Date(firstPayment)
  maturityDate.setMonth(maturityDate.getMonth() + termMonths - 1)

  const amort = calculateAmortization(netPrincipal, rate, termMonths, firstPaymentStr)

  const { data: loan, error } = await db.from('loans').insert({
    borrower_id: borrowerId,
    amount_requested: amountCents, purpose, purpose_description: `Seed - ${purpose}`, term_months: termMonths,
    ai_credit_grade: grade, ai_confidence: 0.85, ai_reasoning: `Seed grade ${grade}`,
    ai_risk_factors: ['Seed data'],
    approved_amount: amountCents, interest_rate: rate,
    monthly_payment: amort.monthly_payment, total_repayment: amort.total_repayment,
    origination_fee: originationFee, origination_fee_percent: 0.02,
    amount_funded: amountCents, funding_percent: 100, lender_count: lenderList.length,
    fully_funded_at: fullyFundedAt.toISOString(),
    status: finalStatus,
    reviewed_by: adminId, reviewed_at: disbursedAt.toISOString(),
    disbursed_at: disbursedAt.toISOString(),
    first_payment_date: firstPaymentStr,
    maturity_date: dateStr(maturityDate),
  }).select().single()

  if (error || !loan) throw new Error(`Loan insert failed: ${error?.message}`)

  // Create commitments
  const commitments: Array<{ id: string; lenderId: string; fraction: number }> = []
  for (const lc of lenderList) {
    const commitAmount = Math.round(amountCents * lc.fraction)
    const sharePercent = lc.fraction * 100
    const expectedYield = Math.round(amort.total_interest * lc.fraction)
    const wallet = await getWallet(lc.id)

    const { data: commitment } = await db.from('funding_commitments').insert({
      lender_id: lc.id, loan_id: loan.id,
      amount: commitAmount, share_percent: sharePercent, expected_yield: expectedYield,
      actual_yield: 0,
      status: finalStatus === 'completed' ? 'completed' : finalStatus === 'defaulted' ? 'non_performing' : 'active',
      funded_at: fullyFundedAt.toISOString(),
      completed_at: finalStatus === 'completed' ? maturityDate.toISOString() : null,
    }).select().single()

    if (!commitment) continue
    commitments.push({ id: commitment.id, lenderId: lc.id, fraction: lc.fraction })

    const newAvail = wallet.available_balance - commitAmount
    const newCommitted = wallet.committed_balance + commitAmount
    await db.from('wallets').update({ available_balance: newAvail, committed_balance: newCommitted }).eq('user_id', lc.id)
    await db.from('transactions').insert({
      user_id: lc.id, wallet_id: wallet.id, type: 'funding_commitment',
      amount: -commitAmount, balance_after: newAvail,
      related_loan_id: loan.id, related_commitment_id: commitment.id,
      description: `Funded ${purpose} loan`,
    })
  }

  // Create schedule
  const { data: schedule } = await db.from('loan_schedule').insert(
    amort.schedule.map(row => ({
      loan_id: loan.id, installment_number: row.installment_number,
      due_date: row.due_date, principal_due: row.principal_due,
      interest_due: row.interest_due, total_due: row.total_due,
      principal_paid: 0, interest_paid: 0, total_paid: 0,
      late_fee: 0, status: 'upcoming', days_late: 0,
    }))
  ).select()
  if (!schedule) throw new Error('Schedule insert failed')

  // Process payments
  const borrowerWallet = await getWallet(borrowerId)
  let borrowerBalance = borrowerWallet.available_balance

  for (let i = 0; i < paymentsAlreadyMade && i < schedule.length; i++) {
    const row = schedule[i]
    const paidAt = new Date(row.due_date)

    await db.from('loan_schedule').update({
      principal_paid: row.principal_due, interest_paid: row.interest_due,
      total_paid: row.total_due, status: 'paid',
      paid_at: paidAt.toISOString(), days_late: 0,
    }).eq('id', row.id)

    borrowerBalance -= row.total_due
    await db.from('transactions').insert({
      user_id: borrowerId, wallet_id: borrowerWallet.id,
      type: 'repayment', amount: -row.total_due, balance_after: Math.max(0, borrowerBalance),
      related_loan_id: loan.id, description: `Installment #${row.installment_number}`,
    })

    for (const c of commitments) {
      const interestReturn = Math.round(row.interest_due * c.fraction)
      const principalReturn = Math.round(row.principal_due * c.fraction)
      const totalReturn = interestReturn + principalReturn
      if (totalReturn === 0) continue

      await db.from('yield_distributions').insert({
        commitment_id: c.id, schedule_id: row.id,
        principal_return: principalReturn, interest_return: interestReturn,
        total_return: totalReturn, distributed_at: paidAt.toISOString(),
      })

      const lw = await getWallet(c.lenderId)
      const newAvail = lw.available_balance + totalReturn
      const newCommitted = Math.max(0, lw.committed_balance - principalReturn)
      const newYield = lw.total_yield_earned + interestReturn
      await db.from('wallets').update({
        available_balance: newAvail, committed_balance: newCommitted, total_yield_earned: newYield,
      }).eq('user_id', c.lenderId)
      await db.from('transactions').insert({
        user_id: c.lenderId, wallet_id: lw.id,
        type: 'yield_distribution', amount: totalReturn, balance_after: newAvail,
        related_loan_id: loan.id, related_commitment_id: c.id,
        description: `Yield from ${purpose} - installment #${row.installment_number}`,
      })
    }
  }

  // Update actual yields on commitments
  for (const c of commitments) {
    const { data: yds } = await db.from('yield_distributions').select('interest_return').eq('commitment_id', c.id)
    const actualYield = yds?.reduce((s, y) => s + y.interest_return, 0) ?? 0
    await db.from('funding_commitments').update({ actual_yield: actualYield }).eq('id', c.id)
  }

  await db.from('wallets').update({ available_balance: Math.max(0, borrowerBalance) }).eq('user_id', borrowerId)

  // Mark missed payments
  for (let i = paymentsAlreadyMade; i < paymentsAlreadyMade + missedAfter && i < schedule.length; i++) {
    const row = schedule[i]
    const daysLate = Math.max(0, Math.floor((Date.now() - new Date(row.due_date).getTime()) / 86400000))
    await db.from('loan_schedule').update({ status: 'missed', days_late: daysLate }).eq('id', row.id)
  }

  // Remaining upcoming
  for (let i = paymentsAlreadyMade + missedAfter; i < schedule.length; i++) {
    const row = schedule[i]
    const isDue = new Date(row.due_date) <= new Date()
    await db.from('loan_schedule').update({ status: isDue ? 'due' : 'upcoming' }).eq('id', row.id)
  }

  return loan
}

async function createFundingLoan(opts: {
  borrowerId: string; adminId: string; purpose: string; amountCents: number
  termMonths: number; grade: string; rate: number
  status: 'funding' | 'fully_funded' | 'approved'
  fundingPercent: number
  lenders: Array<{ id: string; amountCents: number }>
}) {
  const { borrowerId, adminId, purpose, amountCents, termMonths, grade, rate, status, fundingPercent, lenders: lc } = opts
  const originationFee = Math.round(amountCents * 0.02)
  const net = amountCents - originationFee
  const firstPayment = dateStr(new Date(Date.now() + 30 * 86400000))
  const amort = calculateAmortization(net, rate, termMonths, firstPayment)
  const fundingDeadline = new Date(Date.now() + 14 * 86400000)
  const amountFunded = Math.round(amountCents * fundingPercent / 100)
  const now = new Date().toISOString()
  const reviewedAt = new Date(Date.now() - 2 * 86400000).toISOString()

  const { data: loan } = await db.from('loans').insert({
    borrower_id: borrowerId, amount_requested: amountCents, purpose,
    purpose_description: `Seed - ${purpose}`, term_months: termMonths,
    ai_credit_grade: grade, ai_confidence: 0.82, ai_reasoning: `Seed grade ${grade}`,
    ai_risk_factors: ['Seed data'],
    approved_amount: amountCents, interest_rate: rate,
    monthly_payment: amort.monthly_payment, total_repayment: amort.total_repayment,
    origination_fee: originationFee, origination_fee_percent: 0.02,
    amount_funded: amountFunded, funding_percent: fundingPercent, lender_count: lc.length,
    funding_deadline: fundingDeadline.toISOString(),
    fully_funded_at: status === 'fully_funded' ? now : null,
    status, reviewed_by: adminId, reviewed_at: reviewedAt,
  }).select().single()

  if (!loan) throw new Error('Funding loan insert failed')

  for (const l of lc) {
    const sharePercent = (l.amountCents / amountCents) * 100
    const wallet = await getWallet(l.id)
    if (wallet.available_balance < l.amountCents) continue

    const { data: commitment } = await db.from('funding_commitments').insert({
      lender_id: l.id, loan_id: loan.id, amount: l.amountCents,
      share_percent: sharePercent,
      expected_yield: Math.round(amort.total_interest * (sharePercent / 100)),
      actual_yield: 0, status: 'active', funded_at: now,
    }).select().single()

    if (!commitment) continue
    const newAvail = wallet.available_balance - l.amountCents
    const newCommitted = wallet.committed_balance + l.amountCents
    await db.from('wallets').update({ available_balance: newAvail, committed_balance: newCommitted }).eq('user_id', l.id)
    await db.from('transactions').insert({
      user_id: l.id, wallet_id: wallet.id, type: 'funding_commitment',
      amount: -l.amountCents, balance_after: newAvail,
      related_loan_id: loan.id, related_commitment_id: commitment.id,
      description: `Funded ${purpose} opportunity`,
    })
  }

  return loan
}

async function main() {
  console.log('🌱 Starting LendFlow seed...\n')

  // Clean existing seed users
  const seedEmails = [
    'admin@lendflow.dev',
    'borrower1@lendflow.dev', 'borrower2@lendflow.dev', 'borrower3@lendflow.dev',
    'borrower4@lendflow.dev', 'borrower5@lendflow.dev',
    'lender1@lendflow.dev', 'lender2@lendflow.dev', 'lender3@lendflow.dev',
    'lender4@lendflow.dev', 'lender5@lendflow.dev',
  ]
  // Clean from public.users table
  const { data: existing } = await db.from('users').select('id').in('email', seedEmails)
  if (existing?.length) {
    console.log(`Removing ${existing.length} existing seed users...`)
    for (const u of existing) await db.auth.admin.deleteUser(u.id)
  }
  // Also sweep auth.users for any orphaned seed accounts (from previously failed runs)
  const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 200 })
  for (const au of authUsers?.users ?? []) {
    if (seedEmails.includes(au.email ?? '')) {
      await db.auth.admin.deleteUser(au.id)
    }
  }

  // Admin
  console.log('Creating admin...')
  const admin = await createUser('admin@lendflow.dev', 'Alex Admin', 'admin')

  // Borrowers
  console.log('Creating borrowers...')
  const [b1, b2, b3, b4, b5] = await Promise.all([
    createUser('borrower1@lendflow.dev', 'Sarah Chen', 'borrower'),
    createUser('borrower2@lendflow.dev', 'Marcus Johnson', 'borrower'),
    createUser('borrower3@lendflow.dev', 'Emily Rodriguez', 'borrower'),
    createUser('borrower4@lendflow.dev', 'David Park', 'borrower'),
    createUser('borrower5@lendflow.dev', 'Lisa Thompson', 'borrower'),
  ])

  await db.from('borrower_profiles').update({
    date_of_birth: '1988-04-15', address_line1: '214 Elm St', city: 'San Francisco',
    state: 'CA', zip: '94105', employment_status: 'employed', employer: 'Acme Corp',
    job_title: 'Marketing Manager', annual_income: 8500000, monthly_expenses: 350000,
    credit_score_range: 'good', identity_verified: true,
  }).eq('user_id', b1.id)

  await db.from('borrower_profiles').update({
    date_of_birth: '1982-08-22', address_line1: '510 Oak Ave', city: 'Austin',
    state: 'TX', zip: '78701', employment_status: 'self_employed',
    employer: 'Johnson Consulting LLC', job_title: 'Owner', annual_income: 14000000,
    monthly_expenses: 480000, credit_score_range: 'very_good', identity_verified: true,
  }).eq('user_id', b2.id)

  await db.from('borrower_profiles').update({
    date_of_birth: '1991-12-05', address_line1: '87 Lake Dr', city: 'Chicago',
    state: 'IL', zip: '60601', employment_status: 'employed', employer: 'City Hospital',
    job_title: 'Registered Nurse', annual_income: 5200000, monthly_expenses: 290000,
    credit_score_range: 'fair', identity_verified: true,
  }).eq('user_id', b3.id)

  await db.from('borrower_profiles').update({
    date_of_birth: '1995-03-18', address_line1: '32 Pine Rd', city: 'Seattle',
    state: 'WA', zip: '98101', employment_status: 'employed', employer: 'Retail One',
    job_title: 'Store Manager', annual_income: 4500000, monthly_expenses: 280000,
    credit_score_range: 'poor', identity_verified: false,
  }).eq('user_id', b4.id)

  await db.from('borrower_profiles').update({
    date_of_birth: '2000-07-30', address_line1: '9 Coral Way', city: 'Miami',
    state: 'FL', zip: '33101', employment_status: 'student', annual_income: 1800000,
    monthly_expenses: 180000, credit_score_range: 'poor', identity_verified: false,
  }).eq('user_id', b5.id)

  for (const b of [b1, b2, b3, b4, b5]) {
    await depositToWallet(b.id, 5000000, 'Initial wallet funding for repayments')
  }

  // Lenders
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

  await depositToWallet(l1.id, 7500000, 'Initial capital deposit')
  await depositToWallet(l2.id, 12000000, 'Initial capital deposit')
  await depositToWallet(l3.id, 15000000, 'Initial capital deposit')
  await depositToWallet(l4.id, 5000000, 'Initial capital deposit')
  await depositToWallet(l5.id, 9000000, 'Initial capital deposit')

  // ── Completed loans ──────────────────────────────────────────────────────────
  console.log('Creating completed loans...')
  await createActiveLoan({ borrowerId: b1.id, adminId: admin.id, purpose: 'auto', amountCents: 1000000, termMonths: 12, grade: 'B', rate: 0.085, lenders: [{ id: l1.id, fraction: 0.5 }, { id: l4.id, fraction: 0.5 }], paymentsAlreadyMade: 12, startedMonthsAgo: 12, finalStatus: 'completed' })
  await createActiveLoan({ borrowerId: b2.id, adminId: admin.id, purpose: 'debt_consolidation', amountCents: 1500000, termMonths: 24, grade: 'A', rate: 0.055, lenders: [{ id: l2.id, fraction: 0.4 }, { id: l3.id, fraction: 0.4 }, { id: l5.id, fraction: 0.2 }], paymentsAlreadyMade: 24, startedMonthsAgo: 24, finalStatus: 'completed' })
  await createActiveLoan({ borrowerId: b3.id, adminId: admin.id, purpose: 'education', amountCents: 800000, termMonths: 12, grade: 'C', rate: 0.12, lenders: [{ id: l3.id, fraction: 0.6 }, { id: l2.id, fraction: 0.4 }], paymentsAlreadyMade: 12, startedMonthsAgo: 12, finalStatus: 'completed' })

  // ── Repaying loans ───────────────────────────────────────────────────────────
  console.log('Creating repaying loans...')
  await createActiveLoan({ borrowerId: b1.id, adminId: admin.id, purpose: 'home_improvement', amountCents: 2500000, termMonths: 60, grade: 'B', rate: 0.085, lenders: [{ id: l1.id, fraction: 0.35 }, { id: l2.id, fraction: 0.35 }, { id: l5.id, fraction: 0.30 }], paymentsAlreadyMade: 8, startedMonthsAgo: 8, finalStatus: 'repaying' })
  await createActiveLoan({ borrowerId: b2.id, adminId: admin.id, purpose: 'business', amountCents: 3000000, termMonths: 60, grade: 'A', rate: 0.055, lenders: [{ id: l2.id, fraction: 0.4 }, { id: l3.id, fraction: 0.3 }, { id: l4.id, fraction: 0.3 }], paymentsAlreadyMade: 15, startedMonthsAgo: 15, finalStatus: 'repaying' })
  await createActiveLoan({ borrowerId: b3.id, adminId: admin.id, purpose: 'personal', amountCents: 1200000, termMonths: 36, grade: 'C', rate: 0.12, lenders: [{ id: l3.id, fraction: 0.5 }, { id: l5.id, fraction: 0.5 }], paymentsAlreadyMade: 5, startedMonthsAgo: 5, finalStatus: 'repaying' })
  await createActiveLoan({ borrowerId: b4.id, adminId: admin.id, purpose: 'debt_consolidation', amountCents: 500000, termMonths: 24, grade: 'D', rate: 0.165, lenders: [{ id: l3.id, fraction: 1.0 }], paymentsAlreadyMade: 2, startedMonthsAgo: 2, finalStatus: 'repaying' })

  // ── Defaulted loans ──────────────────────────────────────────────────────────
  console.log('Creating defaulted loans...')
  await createActiveLoan({ borrowerId: b4.id, adminId: admin.id, purpose: 'personal', amountCents: 800000, termMonths: 24, grade: 'D', rate: 0.165, lenders: [{ id: l3.id, fraction: 0.6 }, { id: l5.id, fraction: 0.4 }], paymentsAlreadyMade: 3, missedAfter: 3, startedMonthsAgo: 6, finalStatus: 'defaulted' })
  await createActiveLoan({ borrowerId: b5.id, adminId: admin.id, purpose: 'auto', amountCents: 400000, termMonths: 12, grade: 'E', rate: 0.21, lenders: [{ id: l3.id, fraction: 1.0 }], paymentsAlreadyMade: 2, missedAfter: 4, startedMonthsAgo: 6, finalStatus: 'defaulted' })

  // ── Fully funded (awaiting disbursement) ─────────────────────────────────────
  console.log('Creating fully-funded loans...')
  await createFundingLoan({ borrowerId: b5.id, adminId: admin.id, purpose: 'business', amountCents: 2000000, termMonths: 36, grade: 'B', rate: 0.085, status: 'fully_funded', fundingPercent: 100, lenders: [{ id: l1.id, amountCents: 1000000 }, { id: l4.id, amountCents: 1000000 }] })
  await createFundingLoan({ borrowerId: b1.id, adminId: admin.id, purpose: 'home_improvement', amountCents: 3500000, termMonths: 60, grade: 'A', rate: 0.055, status: 'fully_funded', fundingPercent: 100, lenders: [{ id: l2.id, amountCents: 1750000 }, { id: l5.id, amountCents: 1750000 }] })

  // ── Partially funded ─────────────────────────────────────────────────────────
  console.log('Creating funding loans...')
  await createFundingLoan({ borrowerId: b2.id, adminId: admin.id, purpose: 'education', amountCents: 1500000, termMonths: 36, grade: 'B', rate: 0.085, status: 'funding', fundingPercent: 60, lenders: [{ id: l1.id, amountCents: 600000 }, { id: l4.id, amountCents: 300000 }] })
  await createFundingLoan({ borrowerId: b3.id, adminId: admin.id, purpose: 'business', amountCents: 2500000, termMonths: 48, grade: 'C', rate: 0.12, status: 'funding', fundingPercent: 35, lenders: [{ id: l3.id, amountCents: 875000 }] })
  await createFundingLoan({ borrowerId: b4.id, adminId: admin.id, purpose: 'medical', amountCents: 1000000, termMonths: 24, grade: 'D', rate: 0.165, status: 'funding', fundingPercent: 80, lenders: [{ id: l3.id, amountCents: 600000 }, { id: l5.id, amountCents: 200000 }] })

  // ── Approved (waiting to list) ───────────────────────────────────────────────
  console.log('Creating approved loans...')
  await createFundingLoan({ borrowerId: b5.id, adminId: admin.id, purpose: 'debt_consolidation', amountCents: 1200000, termMonths: 36, grade: 'B', rate: 0.085, status: 'approved', fundingPercent: 0, lenders: [] })
  await createFundingLoan({ borrowerId: b1.id, adminId: admin.id, purpose: 'personal', amountCents: 2000000, termMonths: 48, grade: 'A', rate: 0.055, status: 'approved', fundingPercent: 0, lenders: [] })

  // ── Under review ─────────────────────────────────────────────────────────────
  console.log('Creating under-review loans...')
  for (const row of [
    { b: b2, purpose: 'business', amount: 3000000, term: 60, grade: 'A' },
    { b: b3, purpose: 'auto', amount: 800000, term: 24, grade: 'C' },
    { b: b4, purpose: 'education', amount: 500000, term: 12, grade: 'D' },
  ]) {
    await db.from('loans').insert({
      borrower_id: row.b.id, amount_requested: row.amount, purpose: row.purpose, term_months: row.term,
      ai_credit_grade: row.grade, ai_confidence: 0.78, ai_reasoning: `Seed grade ${row.grade}`,
      ai_risk_factors: ['Income below average', 'Short credit history'],
      amount_funded: 0, funding_percent: 0, lender_count: 0, status: 'under_review',
      created_at: new Date(Date.now() - Math.floor(Math.random() * 3) * 86400000).toISOString(),
    })
  }

  // ── Submitted ─────────────────────────────────────────────────────────────────
  console.log('Creating submitted loans...')
  for (const row of [
    { b: b5, purpose: 'home_improvement', amount: 1500000, term: 36 },
    { b: b1, purpose: 'medical', amount: 1000000, term: 24 },
    { b: b2, purpose: 'personal', amount: 700000, term: 24 },
  ]) {
    await db.from('loans').insert({
      borrower_id: row.b.id, amount_requested: row.amount, purpose: row.purpose, term_months: row.term,
      amount_funded: 0, funding_percent: 0, lender_count: 0, status: 'submitted',
      created_at: new Date(Date.now() - Math.floor(Math.random() * 12) * 3600000).toISOString(),
    })
  }

  // ── Rejected ──────────────────────────────────────────────────────────────────
  await db.from('loans').insert({
    borrower_id: b4.id, amount_requested: 5000000, purpose: 'business', term_months: 60,
    ai_credit_grade: 'E', ai_confidence: 0.91,
    ai_reasoning: 'Very high risk: poor credit, 62% DTI, no verifiable business history.',
    ai_risk_factors: ['Poor credit score', 'High DTI', 'No business history'],
    debt_to_income_ratio: 0.62, amount_funded: 0, funding_percent: 0, lender_count: 0,
    status: 'rejected',
    rejection_reason: 'Credit score below minimum threshold. DTI of 62% exceeds the 45% maximum.',
    reviewed_by: admin.id, reviewed_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  })

  // ── Drafts ────────────────────────────────────────────────────────────────────
  await db.from('loans').insert([
    { borrower_id: b3.id, amount_requested: 1000000, purpose: 'debt_consolidation', term_months: 36, amount_funded: 0, funding_percent: 0, lender_count: 0, status: 'draft' },
    { borrower_id: b5.id, amount_requested: 800000, purpose: 'personal', term_months: 24, amount_funded: 0, funding_percent: 0, lender_count: 0, status: 'draft' },
  ])

  console.log('\n✅ Seed complete!\n')
  console.log('Login credentials (password: Lendflow123!)')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('Admin:      admin@lendflow.dev')
  console.log('Borrower 1: borrower1@lendflow.dev  — Sarah Chen (Grade B, employed)')
  console.log('Borrower 2: borrower2@lendflow.dev  — Marcus Johnson (Grade A, self-employed)')
  console.log('Borrower 3: borrower3@lendflow.dev  — Emily Rodriguez (Grade C, nurse)')
  console.log('Borrower 4: borrower4@lendflow.dev  — David Park (Grade D, defaulted loan)')
  console.log('Borrower 5: borrower5@lendflow.dev  — Lisa Thompson (Grade E, student)')
  console.log('Lender 1:   lender1@lendflow.dev    — Robert Kim (conservative)')
  console.log('Lender 2:   lender2@lendflow.dev    — Jennifer Walsh (moderate, institutional)')
  console.log('Lender 3:   lender3@lendflow.dev    — Michael Torres (aggressive)')
  console.log('Lender 4:   lender4@lendflow.dev    — Amanda Foster (conservative)')
  console.log('Lender 5:   lender5@lendflow.dev    — Christopher Lee (moderate)')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('Loans created: 3 completed, 4 repaying, 2 defaulted, 2 fully-funded,')
  console.log('              3 funding, 2 approved, 3 under-review, 3 submitted, 1 rejected, 2 draft')
  console.log('Total: 25 loans')
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
