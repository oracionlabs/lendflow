import { daysBetween, manilaToday } from '@lendflow/shared'

export interface RollRow {
  id: string
  due_date: string
  principal_due: number
  principal_paid?: number | null
  interest_due: number
  interest_paid?: number | null
  total_due: number
  total_paid?: number | null
  status: string
}

/** After interest is paid, move open principal to a later due date and load interest for the new period. */
export function planInterestRoll(open: RollRow[], newDue: string, annualRate: number, asOf = manilaToday()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDue)) return { error: 'Choose a new due date' as const }
  const stillOpen = open.filter(row => !['paid', 'waived'].includes(row.status) && Math.max(0, row.principal_due - (row.principal_paid ?? 0)) > 0)
  if (!stillOpen.length) return { error: 'This loan is already paid' as const }
  const last = stillOpen[stillOpen.length - 1]
  const extraDays = daysBetween(last.due_date, newDue)
  if (extraDays <= 0) return { error: 'The new due date has to be after the current due date' as const }
  const principal = stillOpen.reduce((sum, row) => sum + Math.max(0, row.principal_due - (row.principal_paid ?? 0)), 0)
  const rate = Number.isFinite(annualRate) ? Math.max(0, annualRate) : 0
  const periodDays = Math.max(0, daysBetween(asOf, newDue))
  const newInterest = Math.round(principal * rate * periodDays / 365)
  const updates = stillOpen.map(row => {
    const shifted = new Date(`${row.due_date}T00:00:00`)
    shifted.setDate(shifted.getDate() + extraDays)
    const due = shifted.toISOString().split('T')[0]
    const isLast = row.id === last.id
    return {
      id: row.id,
      due_date: due,
      interest_due: row.interest_due + (isLast ? newInterest : 0),
      total_due: row.total_due + (isLast ? newInterest : 0),
    }
  })
  return { updates, newInterest, maturity: updates[updates.length - 1]?.due_date ?? newDue, extraDays, principal }
}
