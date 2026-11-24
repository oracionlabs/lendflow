import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useCurrency } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { CommitmentCard, type DashboardLoan } from '@/features/lender/CommitmentCard'
import type { FundingCommitment } from '@lendflow/shared'
import { TrendingUp } from 'lucide-react'

interface CommitmentWithLoan extends FundingCommitment {
  loans: DashboardLoan
}

export function LenderLoans() {
  useCurrency() // subscribe to currency changes
  const { data: commitments, isLoading } = useQuery({
    queryKey: ['lender-commitments'],
    queryFn: async () => {
      const { data } = await api.get<{ commitments: CommitmentWithLoan[] }>('/api/lender/commitments')
      return data.commitments ?? []
    },
  })

  if (isLoading) return (
    <div className="max-w-5xl mx-auto space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )

  const ACTIVE = ['active', 'performing', 'repaying']
  const active = commitments?.filter(c => ACTIVE.includes(c.status) || ['active', 'repaying', 'approved', 'funding', 'fully_funded'].includes((c.loans as { status?: string })?.status ?? '')) ?? []
  const other = commitments?.filter(c => !active.includes(c)) ?? []

  function LoanRow({ c }: { c: CommitmentWithLoan }) {
    return <CommitmentCard id={c.id} amount={c.amount} loan={c.loans} />
  }

  return (
    <div className="max-w-5xl mx-auto space-y-7">
      <div>
        <h1 className="page-heading">My Loans</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Track balances, terms, and upcoming payments.</p>
      </div>

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
              <h2 className="section-label mb-3">Active</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {active.map(c => <LoanRow key={c.id} c={c} />)}
              </div>
            </section>
          )}
          {other.length > 0 && (
            <section>
              <h2 className="section-label mb-3">Other</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {other.map(c => <LoanRow key={c.id} c={c} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
