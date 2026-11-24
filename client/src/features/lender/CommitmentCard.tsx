import { Link } from 'react-router-dom'
import { formatCents, formatDate, formatPercent } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { LoanPurpose, LoanStatus } from '@lendflow/shared'
import { ChevronRight } from 'lucide-react'

interface ScheduleRow {
  installment_number: number
  due_date: string
  total_due: number
  total_paid: number
  status: string
}

export interface DashboardLoan {
  id?: string
  purpose: string
  term_months: number
  interest_rate: number
  status: string
  currency?: string
  monthly_payment?: number
  loan_kind?: 'cash' | 'product'
  product_name?: string | null
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
    <Link to={`/lender/commitments/${id}`}
      className="block card-base p-4 active:scale-[0.99] transition-transform space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{borrower || title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {borrower ? title : 'Borrower'} · {loan.loan_kind === 'product' ? 'Product' : 'Cash'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge status={loan.status as LoanStatus} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <p><span className="text-muted-foreground">Lent </span><span className="font-medium">{formatCents(amount, currency)}</span></p>
        <p><span className="text-muted-foreground">Rate </span><span className="font-medium">{formatPercent(loan.interest_rate ?? 0)}</span></p>
        <p><span className="text-muted-foreground">Term </span><span className="font-medium">{loan.term_months} mo</span></p>
        <p><span className="text-muted-foreground">Left </span><span className="font-medium">{formatCents(remaining, currency)}</span></p>
      </div>
      <p className="text-xs text-muted-foreground">
        {next
          ? `Next ${formatDate(next.due_date)} · ${formatCents(owed, currency)}`
          : loan.maturity_date
            ? `Matures ${formatDate(loan.maturity_date)}`
            : 'No payment due'}
      </p>
    </Link>
  )
}
