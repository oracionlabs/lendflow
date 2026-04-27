import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatPercent, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { FundingCommitment, LoanStatus } from '@lendflow/shared'
import { ChevronRight, TrendingUp } from 'lucide-react'

interface CommitmentWithLoan extends FundingCommitment {
  loans: {
    id: string; purpose: string; term_months: number; interest_rate: number
    ai_credit_grade?: string; admin_override_grade?: string
    status: string; first_payment_date?: string; maturity_date?: string
    amount_requested: number; approved_amount: number
  }
}

export function LenderLoans() {
  const { data: commitments, isLoading } = useQuery({
    queryKey: ['lender-commitments'],
    queryFn: async () => {
      const { data } = await api.get<{ commitments: CommitmentWithLoan[] }>('/api/lender/commitments')
      return data.commitments ?? []
    },
  })

  if (isLoading) return (
    <div className="max-w-lg mx-auto space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )

  const active = commitments?.filter(c => ['active', 'performing'].includes(c.status)) ?? []
  const other = commitments?.filter(c => !['active', 'performing'].includes(c.status)) ?? []

  function CommitmentCard({ c }: { c: CommitmentWithLoan }) {
    const loan = c.loans
    return (
      <Link to={`/lender/commitments/${c.id}`}
        className="flex items-center justify-between card-base p-4 active:scale-[0.99] transition-transform">
        <div className="min-w-0">
          <p className="font-medium text-sm">{LOAN_PURPOSE_LABELS[loan?.purpose] ?? loan?.purpose}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCents(c.amount)} · {formatPercent(loan?.interest_rate ?? 0)}
            {loan?.maturity_date ? ` · Matures ${formatDate(loan.maturity_date)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <StatusBadge status={(loan?.status ?? c.status) as LoanStatus} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold">My Loans</h1>

      {!commitments?.length ? (
        <div className="text-center py-16 space-y-3">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="font-medium">No loans yet</p>
          <p className="text-sm text-muted-foreground">Accept a request or originate a new loan</p>
          <div className="flex gap-3 justify-center mt-2">
            <Link to="/lender/requests"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
              View Requests
            </Link>
            <Link to="/lender/new-loan"
              className="rounded-xl border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
              New Loan
            </Link>
          </div>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Active</h2>
              <div className="space-y-2">
                {active.map(c => <CommitmentCard key={c.id} c={c} />)}
              </div>
            </section>
          )}
          {other.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Other</h2>
              <div className="space-y-2">
                {other.map(c => <CommitmentCard key={c.id} c={c} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
