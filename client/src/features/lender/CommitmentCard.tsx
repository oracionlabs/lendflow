import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from 'sonner'
import { formatCents, formatDate, formatPercent } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { LOAN_PURPOSE_LABELS, quoteAdvance } from '@lendflow/shared'
import type { LoanPurpose, LoanStatus } from '@lendflow/shared'
import { ChevronRight } from 'lucide-react'
import { expectedFullPayment, PaidInFullDialog } from './PaidInFullDialog'

interface ScheduleRow {
  installment_number: number
  due_date: string
  total_due: number
  total_paid: number
  status: string
  principal_due?: number
  principal_paid?: number
  interest_due?: number
  interest_paid?: number
}

export interface DashboardLoan {
  id?: string
  purpose: string
  term_months: number
  repayment_type?: string
  interest_rate: number
  status: string
  currency?: string
  monthly_payment?: number
  loan_kind?: 'cash' | 'product'
  product_name?: string | null
  payment_channel?: 'wallet' | 'instapay'
  maturity_date?: string
  users?: { name: string } | { name: string }[] | null
  loan_schedule?: ScheduleRow[]
}

function personName(users: DashboardLoan['users']): string {
  if (!users) return ''
  const row = Array.isArray(users) ? users[0] : users
  return row?.name ?? ''
}

export function CommitmentCard({
  id,
  amount,
  loan,
}: {
  id: string
  amount: number
  loan: DashboardLoan
}) {
  const currency = loan.currency
  const title = loan.loan_kind === 'product' && loan.product_name
    ? loan.product_name
    : (LOAN_PURPOSE_LABELS[loan.purpose as LoanPurpose] ?? loan.purpose)
  const borrower = personName(loan.users)
  const schedule = [...(loan.loan_schedule ?? [])].sort((a, b) => a.installment_number - b.installment_number)
  const open = schedule.filter(row => !['paid', 'waived'].includes(row.status))
  const next = open[0]
  const remaining = open.reduce((sum, row) => sum + Math.max(0, row.total_due - (row.total_paid ?? 0)), 0)
  const owed = next ? Math.max(0, next.total_due - (next.total_paid ?? 0)) : 0

  return (
    <article className="card-base interactive-card p-4 sm:p-5 space-y-4">
    <Link to={`/lender/commitments/${id}`}
      className="block space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{borrower || title}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {borrower ? title : 'Borrower'} · {loan.loan_kind === 'product' ? 'Product' : 'Cash'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge status={loan.status as LoanStatus} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Lent', formatCents(amount, currency)],
          ['Rate', formatPercent(loan.interest_rate ?? 0)],
          ['Term', loan.repayment_type === 'dated' ? `${schedule.length} dates` : `${loan.term_months} mo`],
          ['Remaining', formatCents(remaining, currency)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs font-medium text-foreground">
        {next
          ? `Next payment · ${formatDate(next.due_date)} · ${formatCents(owed, currency)}`
          : loan.maturity_date
            ? `Matures ${formatDate(loan.maturity_date)}`
            : 'No payment due'}
      </p>
    </Link>
    {loan.payment_channel === 'instapay' && loan.id && remaining > 0 && (
      <PayControls loanId={loan.id} loan={loan} schedule={schedule} currency={currency} />
    )}
    </article>
  )
}

function PayControls({
  loanId,
  loan,
  schedule,
  currency,
}: {
  loanId: string
  loan: DashboardLoan
  schedule: ScheduleRow[]
  currency?: string
}) {
  const [amount, setAmount] = useState('')
  const [confirmFull, setConfirmFull] = useState(false)
  const qc = useQueryClient()
  const pay = useMutation({
    mutationFn: (body: { mode: 'partial' | 'full' | 'advance'; amount?: number }) =>
      api.post(`/api/lender/loans/${loanId}/instapay-payment`, body),
    onSuccess: (res) => {
      setAmount('')
      setConfirmFull(false)
      qc.invalidateQueries({ queryKey: ['lender-commitments'] })
      const saved = (res.data as { interest_saved?: number }).interest_saved ?? 0
      toast.success(saved > 0 ? 'Advance payment recorded. Interest was recalculated.' : 'Payment recorded')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not record the payment'
      toast.error(msg)
    },
  })

  const full = expectedFullPayment(schedule)
  const advance = quoteAdvance(schedule.map(row => ({
    ...row,
    principal_due: row.principal_due ?? 0,
    interest_due: row.interest_due ?? 0,
  })), loan.interest_rate ?? 0)
  const early = advance && advance.days_early > 0 && advance.interest_saved > 0

  return (
    <div className="space-y-2">
    {early && (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs text-muted-foreground">
          Early payoff {formatCents(advance.payoff_amount, currency)}. That removes {formatCents(advance.interest_saved, currency)} of interest.
        </p>
        <button
          type="button"
          disabled={pay.isPending}
          onClick={() => pay.mutate({ mode: 'advance' })}
          className="min-h-11 rounded-xl border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          Pay early
        </button>
      </div>
    )}
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        type="number"
        min="1"
        inputMode="decimal"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="Partial amount"
        className="min-h-11 flex-1 rounded-xl border bg-background px-3 text-sm"
      />
      <button
        type="button"
        disabled={pay.isPending || !(Number(amount) > 0)}
        onClick={() => pay.mutate({ mode: 'partial', amount: Math.round(Number(amount) * 100) })}
        className="min-h-11 rounded-xl border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
      >
        Partial
      </button>
      <button
        type="button"
        disabled={pay.isPending}
        onClick={() => setConfirmFull(true)}
        className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Paid in full
      </button>
    </div>
    <PaidInFullDialog
      open={confirmFull}
      currency={currency}
      expected={full.expected}
      principal={full.principal}
      interest={full.interest}
      pending={pay.isPending}
      onCancel={() => setConfirmFull(false)}
      onConfirm={() => pay.mutate({ mode: 'full' })}
    />
    </div>
  )
}
