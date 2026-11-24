import { useEffect } from 'react'
import { formatCents } from '@/lib/utils'

export interface PayableRow {
  status: string
  total_due: number
  total_paid?: number | null
  principal_due?: number | null
  principal_paid?: number | null
  interest_due?: number | null
  interest_paid?: number | null
}

export function expectedFullPayment(rows: PayableRow[]) {
  const open = rows.filter(row => !['paid', 'waived'].includes(row.status))
  const expected = open.reduce((sum, row) => sum + Math.max(0, row.total_due - (row.total_paid ?? 0)), 0)
  const principal = open.reduce((sum, row) => sum + Math.max(0, (row.principal_due ?? 0) - (row.principal_paid ?? 0)), 0)
  const interest = open.reduce((sum, row) => sum + Math.max(0, (row.interest_due ?? 0) - (row.interest_paid ?? 0)), 0)
  return { expected, principal, interest }
}

export function PaidInFullDialog({
  open,
  currency,
  expected,
  principal,
  interest,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  currency?: string
  expected: number
  principal: number
  interest: number
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  const showBreakdown = principal > 0 || interest > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B2233]/40 p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paid-full-title"
        className="w-full max-w-sm border border-border bg-card p-6"
        onClick={event => event.stopPropagation()}
      >
        <h2 id="paid-full-title" className="font-serif text-[27px] leading-tight tracking-tight">Paid in full</h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          This is the remaining scheduled amount. The loan is marked paid only after you confirm.
        </p>
        <p className="caps mt-6 text-foreground">Expected payment</p>
        <p className="num mt-2 text-[44px] leading-none">{formatCents(expected, currency)}</p>
        {showBreakdown && (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">Principal</dt>
              <dd className="num mt-1 text-xl">{formatCents(principal, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Interest</dt>
              <dd className="num mt-1 text-xl">{formatCents(interest, currency)}</dd>
            </div>
          </dl>
        )}
        <div className="mt-6 flex items-center gap-4">
          <button type="button" onClick={onCancel} className="min-h-12 px-1.5 text-sm font-semibold text-accent">
            Cancel
          </button>
          <button type="button" disabled={pending || expected <= 0} onClick={onConfirm} className="button-primary flex-1">
            {pending ? 'Recording…' : 'Mark paid in full'}
          </button>
        </div>
      </div>
    </div>
  )
}
