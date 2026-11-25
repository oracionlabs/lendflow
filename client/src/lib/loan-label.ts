import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'

export interface LoanLabelSource {
  purpose: string
  purpose_description?: string | null
  loan_kind?: string | null
  product_name?: string | null
}

export function loanTitle(loan: LoanLabelSource): string {
  if (loan.loan_kind === 'product' && loan.product_name?.trim()) return loan.product_name.trim()
  const formula = (loan.purpose_description ?? '')
    .split('. ')
    .map(part => part.trim())
    .find(part => part.includes('='))
  if (formula) return formula.split(' due ')[0]
  return LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose
}

export interface ScheduleBit {
  due_date: string
  total_due: number
  total_paid?: number | null
  status: string
}

export function loanBalance(rows: ScheduleBit[] | undefined) {
  const open = (rows ?? []).filter(row => !['paid', 'waived'].includes(row.status))
  const remaining = open.reduce((sum, row) => sum + Math.max(0, row.total_due - (row.total_paid ?? 0)), 0)
  const paid = (rows ?? []).reduce((sum, row) => sum + Math.max(0, row.total_paid ?? 0), 0)
  const next = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  return { remaining, paid, nextDue: next?.due_date }
}

const OPEN_STATUSES = ['active', 'repaying', 'approved', 'funding', 'fully_funded']

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function borrowerSnapshot(loans: { status: string; currency?: string; loan_schedule?: ScheduleBit[] }[]) {
  const today = manilaToday()
  const soon = addIsoDays(today, 7)
  const open = loans.filter(loan => OPEN_STATUSES.includes(loan.status))
  const currency = open.find(loan => loan.currency)?.currency
  let owed = 0
  let paid = 0
  let overdue = 0
  let dueSoon = 0
  for (const loan of open) {
    if (currency && loan.currency && loan.currency !== currency) continue
    const balance = loanBalance(loan.loan_schedule)
    owed += balance.remaining
    paid += balance.paid
    if (!balance.nextDue) continue
    if (balance.nextDue < today) overdue += balance.remaining
    else if (balance.nextDue <= soon) dueSoon += balance.remaining
  }
  return { owed, paid, overdue, dueSoon, openCount: open.length, currency }
}

export function personName(users: { name?: string } | { name?: string }[] | null | undefined): string {
  if (!users) return ''
  const row = Array.isArray(users) ? users[0] : users
  return row?.name ?? ''
}
