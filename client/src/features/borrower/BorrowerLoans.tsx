import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatDate, useCurrency } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { Loan } from '@lendflow/shared'
import { ChevronRight, FileText } from 'lucide-react'

const ACTIVE_STATUSES = ['active', 'repaying', 'approved', 'funding', 'fully_funded']
const PENDING_STATUSES = ['submitted', 'under_review']
const PAST_STATUSES = ['completed', 'rejected', 'cancelled', 'defaulted']

function LoanCard({ loan }: { loan: Loan }) {
  return (
    <Link to={`/borrower/loans/${loan.id}`}
      className="flex items-center justify-between card-base p-4 active:scale-[0.99] transition-transform">
      <div className="min-w-0">
        <p className="font-medium text-sm">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatCents(loan.amount_requested)}
          {loan.first_payment_date ? ` · Due ${formatDate(loan.first_payment_date)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <StatusBadge status={loan.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}

function Section({ title, loans }: { title: string; loans: Loan[] }) {
  if (!loans.length) return null
  return (
    <section>
      <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide text-[11px]">{title}</h2>
      <div className="space-y-2">
        {loans.map(l => <LoanCard key={l.id} loan={l} />)}
      </div>
    </section>
  )
}

export function BorrowerLoans() {
  useCurrency() // subscribe to currency changes
  const { data: loans, isLoading } = useQuery({
    queryKey: ['borrower-loans'],
    queryFn: async () => {
      const { data } = await api.get<{ loans: Loan[] }>('/api/loans')
      return data.loans
    },
  })

  if (isLoading) return (
    <div className="max-w-lg mx-auto space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )

  const active = loans?.filter(l => ACTIVE_STATUSES.includes(l.status)) ?? []
  const pending = loans?.filter(l => PENDING_STATUSES.includes(l.status)) ?? []
  const past = loans?.filter(l => PAST_STATUSES.includes(l.status)) ?? []

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold">My Loans</h1>

      {!loans?.length ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="font-medium">No loans yet</p>
          <p className="text-sm text-muted-foreground">Find a lender to get started</p>
          <Link to="/borrower/lenders"
            className="inline-block mt-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
            Browse Lenders
          </Link>
        </div>
      ) : (
        <>
          <Section title="Active" loans={active} />
          <Section title="Applications" loans={pending} />
          <Section title="Past" loans={past} />
        </>
      )}
    </div>
  )
}
