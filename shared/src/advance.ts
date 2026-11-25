export interface AdvanceScheduleRow {
  due_date: string
  principal_due: number
  principal_paid?: number | null
  interest_due: number
  interest_paid?: number | null
  total_due: number
  total_paid?: number | null
  status: string
}

export interface AdvanceQuote {
  as_of: string
  due_date: string
  days_early: number
  remaining_principal: number
  unpaid_interest: number
  interest_due_today: number
  interest_saved: number
  payoff_amount: number
  scheduled_amount: number
}

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

export function quoteAdvance(
  schedule: AdvanceScheduleRow[],
  annualRate: number,
  asOf = manilaToday(),
): AdvanceQuote | null {
  const open = schedule.filter(row => !['paid', 'waived'].includes(row.status) && row.total_due - (row.total_paid ?? 0) > 0)
  if (!open.length) return null

  const due = open.reduce((latest, row) => (row.due_date > latest ? row.due_date : latest), open[0].due_date)
  const daysEarly = Math.max(0, daysBetween(asOf, due))
  const remainingPrincipal = open.reduce((sum, row) => sum + Math.max(0, row.principal_due - (row.principal_paid ?? 0)), 0)
  const unpaidInterest = open.reduce((sum, row) => sum + Math.max(0, row.interest_due - (row.interest_paid ?? 0)), 0)
  const scheduled = open.reduce((sum, row) => sum + Math.max(0, row.total_due - (row.total_paid ?? 0)), 0)
  const rate = Number.isFinite(annualRate) ? Math.max(0, annualRate) : 0
  const interestSaved = Math.min(unpaidInterest, Math.max(0, Math.round(remainingPrincipal * rate * daysEarly / 365)))

  return {
    as_of: asOf.slice(0, 10),
    due_date: due.slice(0, 10),
    days_early: daysEarly,
    remaining_principal: remainingPrincipal,
    unpaid_interest: unpaidInterest,
    interest_due_today: unpaidInterest - interestSaved,
    interest_saved: interestSaved,
    payoff_amount: Math.max(0, scheduled - interestSaved),
    scheduled_amount: scheduled,
  }
}

export interface TodayQuote {
  as_of: string
  due_date: string
  days_from_due: number
  principal: number
  interest_today: number
  payment_today: number
  scheduled_interest: number
  scheduled_payment: number
}

/** Interest and full payment if the loan is settled on `asOf` (Manila today by default). */
export function quoteAsOfToday(
  schedule: AdvanceScheduleRow[],
  annualRate: number,
  asOf = manilaToday(),
): TodayQuote | null {
  const base = quoteAdvance(schedule, annualRate, asOf)
  if (!base) return null
  const daysFromDue = daysBetween(base.due_date, base.as_of)
  const rate = Number.isFinite(annualRate) ? Math.max(0, annualRate) : 0
  const lateInterest = daysFromDue > 0
    ? Math.round(base.remaining_principal * rate * daysFromDue / 365)
    : 0
  const interest = daysFromDue > 0 ? base.unpaid_interest + lateInterest : base.interest_due_today
  return {
    as_of: base.as_of,
    due_date: base.due_date,
    days_from_due: daysFromDue,
    principal: base.remaining_principal,
    interest_today: interest,
    payment_today: base.remaining_principal + interest,
    scheduled_interest: base.unpaid_interest,
    scheduled_payment: base.scheduled_amount,
  }
}

/** Returns a copy of the schedule whose open interest matches `quoteAsOfToday`. */
export function applyTodayInterest<T extends AdvanceScheduleRow>(
  schedule: T[],
  annualRate: number,
  asOf = manilaToday(),
): { quote: TodayQuote; rows: T[] } | null {
  const quote = quoteAsOfToday(schedule, annualRate, asOf)
  if (!quote) return null
  const rows = schedule.map(row => ({ ...row }))
  let delta = quote.interest_today - quote.scheduled_interest
  const openIdx = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !['paid', 'waived'].includes(row.status) && row.total_due - (row.total_paid ?? 0) > 0)
    .map(({ index }) => index)
  if (!openIdx.length || delta === 0) return { quote, rows }
  if (delta > 0) {
    const row = rows[openIdx[openIdx.length - 1]]
    row.interest_due += delta
    row.total_due += delta
    return { quote, rows }
  }
  for (let i = openIdx.length - 1; i >= 0 && delta < 0; i--) {
    const row = rows[openIdx[i]]
    const room = Math.max(0, row.interest_due - (row.interest_paid ?? 0))
    const cut = Math.min(room, -delta)
    row.interest_due -= cut
    row.total_due -= cut
    delta += cut
  }
  return { quote, rows }
}

export function partialAdvanceSavings(
  schedule: AdvanceScheduleRow[],
  annualRate: number,
  amount: number,
  asOf = manilaToday(),
): number {
  const quote = quoteAdvance(schedule, annualRate, asOf)
  if (!quote || amount <= 0 || quote.days_early <= 0) return 0
  if (amount >= quote.payoff_amount) return quote.interest_saved
  const principalPaid = Math.min(quote.remaining_principal, Math.max(0, amount - quote.interest_due_today))
  if (principalPaid <= 0) return 0
  const rate = Number.isFinite(annualRate) ? Math.max(0, annualRate) : 0
  return Math.min(quote.unpaid_interest, Math.max(0, Math.round(principalPaid * rate * quote.days_early / 365)))
}
