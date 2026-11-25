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

export function personName(users: { name?: string } | { name?: string }[] | null | undefined): string {
  if (!users) return ''
  const row = Array.isArray(users) ? users[0] : users
  return row?.name ?? ''
}
