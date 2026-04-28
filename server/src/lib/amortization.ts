export interface AmortizationRow {
  installment_number: number
  due_date: string
  principal_due: number
  interest_due: number
  total_due: number
}

export interface AmortizationResult {
  monthly_payment: number
  total_repayment: number
  total_interest: number
  schedule: AmortizationRow[]
}

export function calculateAmortization(
  principal: number,
  annualRate: number,
  termMonths: number,
  firstPaymentDate: string
): AmortizationResult {
  const r = annualRate / 12

  const monthlyPaymentExact =
    r === 0
      ? principal / termMonths
      : (principal * (r * Math.pow(1 + r, termMonths))) / (Math.pow(1 + r, termMonths) - 1)

  const monthly_payment = Math.round(monthlyPaymentExact)

  const schedule: AmortizationRow[] = []
  let balance = principal
  const startDate = new Date(firstPaymentDate)

  for (let i = 1; i <= termMonths; i++) {
    const interest_due = Math.round(balance * r)
    let principal_due = monthly_payment - interest_due

    if (i === termMonths) {
      principal_due = balance
    }

    const total_due = principal_due + interest_due
    balance = Math.max(0, balance - principal_due)

    const payDate = new Date(startDate)
    payDate.setMonth(payDate.getMonth() + (i - 1))
    const due_date = payDate.toISOString().split('T')[0]

    schedule.push({ installment_number: i, due_date, principal_due, interest_due, total_due })
  }

  const total_repayment = schedule.reduce((sum, row) => sum + row.total_due, 0)
  const total_interest = total_repayment - principal

  return { monthly_payment, total_repayment, total_interest, schedule }
}

export interface InterestOnlyResult {
  monthly_interest_payment: number
  balloon_payment: number
  total_repayment: number
  total_interest: number
  schedule: AmortizationRow[]
}

export function calculateInterestOnly(
  principal: number,
  annualRate: number,
  termMonths: number,
  firstPaymentDate: string
): InterestOnlyResult {
  const r = annualRate / 12
  const monthlyInterest = Math.round(principal * r)
  const schedule: AmortizationRow[] = []
  const startDate = new Date(firstPaymentDate)

  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths
    const principal_due = isLast ? principal : 0
    const interest_due = monthlyInterest
    const payDate = new Date(startDate)
    payDate.setMonth(payDate.getMonth() + (i - 1))
    schedule.push({
      installment_number: i,
      due_date: payDate.toISOString().split('T')[0],
      principal_due,
      interest_due,
      total_due: principal_due + interest_due,
    })
  }

  const total_repayment = schedule.reduce((s, r) => s + r.total_due, 0)
  return {
    monthly_interest_payment: monthlyInterest,
    balloon_payment: principal + monthlyInterest,
    total_repayment,
    total_interest: total_repayment - principal,
    schedule,
  }
}

export interface DailyInterestResult {
  daily_interest_amount: number
  total_if_full_term: number
  total_interest_if_full_term: number
  schedule: AmortizationRow[]
}

export function calculateDailyInterest(
  principal: number,
  dailyRate: number,
  maxTermDays: number,
  startDate: string
): DailyInterestResult {
  const daily_interest_amount = Math.round(principal * dailyRate)
  const total_interest = Math.round(principal * dailyRate * maxTermDays)
  const total_if_full_term = principal + total_interest
  const maturityDate = new Date(startDate)
  maturityDate.setDate(maturityDate.getDate() + maxTermDays)
  return {
    daily_interest_amount,
    total_if_full_term,
    total_interest_if_full_term: total_interest,
    schedule: [{
      installment_number: 1,
      due_date: maturityDate.toISOString().split('T')[0],
      principal_due: principal,
      interest_due: total_interest,
      total_due: total_if_full_term,
    }],
  }
}

export function calculateCustomSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  frequency: 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly',
  firstPaymentDate: string
): AmortizationResult {
  const periodsPerYear: Record<string, number> = { weekly: 52, bi_weekly: 26, monthly: 12, quarterly: 4 }
  const daysPerPeriod: Record<string, number> = { weekly: 7, bi_weekly: 14, monthly: 30, quarterly: 91 }
  const ppy = periodsPerYear[frequency]
  const dpp = daysPerPeriod[frequency]
  const rPeriod = annualRate / ppy
  const totalPeriods = Math.round((termMonths / 12) * ppy)

  const periodPaymentExact = rPeriod === 0
    ? principal / totalPeriods
    : (principal * (rPeriod * Math.pow(1 + rPeriod, totalPeriods))) / (Math.pow(1 + rPeriod, totalPeriods) - 1)
  const periodPayment = Math.round(periodPaymentExact)

  const schedule: AmortizationRow[] = []
  let balance = principal
  const start = new Date(firstPaymentDate)

  for (let i = 1; i <= totalPeriods; i++) {
    const interest_due = Math.round(balance * rPeriod)
    const principal_due = i === totalPeriods ? balance : periodPayment - interest_due
    const total_due = principal_due + interest_due
    balance = Math.max(0, balance - principal_due)
    const payDate = new Date(start)
    payDate.setDate(payDate.getDate() + (i - 1) * dpp)
    schedule.push({
      installment_number: i,
      due_date: payDate.toISOString().split('T')[0],
      principal_due,
      interest_due,
      total_due,
    })
  }

  const total_repayment = schedule.reduce((s, r) => s + r.total_due, 0)
  return { monthly_payment: periodPayment, total_repayment, total_interest: total_repayment - principal, schedule }
}

export function previewMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 12
  if (r === 0) return Math.round(principal / termMonths)
  const payment = (principal * (r * Math.pow(1 + r, termMonths))) / (Math.pow(1 + r, termMonths) - 1)
  return Math.round(payment)
}

export function calculatePayoffQuote(
  remainingBalance: number,
  remainingSchedule: Array<{ interest_due: number }>
): { payoff_amount: number; interest_saved: number } {
  const interest_remaining = remainingSchedule.reduce((sum, r) => sum + r.interest_due, 0)
  return { payoff_amount: remainingBalance, interest_saved: interest_remaining }
}
