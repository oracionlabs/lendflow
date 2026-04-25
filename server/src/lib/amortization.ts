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
