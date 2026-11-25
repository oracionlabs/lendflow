import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { formatCents, useCurrency } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { CommitmentCard, type DashboardLoan } from '@/features/lender/CommitmentCard'
import { LenderCollections } from '@/features/lender/LenderCollections'
import type { FundingCommitment } from '@lendflow/shared'
import { ChevronRight, Plus } from 'lucide-react'

const RATE_PERIOD_LABELS: Record<string, string> = {
  per_15_days: '/ 15 days', per_30_days: '/ 30 days',
  monthly: '/ month', annually: '/ year', flat: 'flat',
}

interface PortfolioSummary {
  total_committed: number; active_loans: number
  total_yield_earned: number; projected_future_yield: number
}

interface Listing {
  id: string; available_amount: number; interest_rate: number
  rate_period: string; status: string; min_loan: number; max_loan: number
}

interface CommitmentWithLoan extends FundingCommitment {
  loans: DashboardLoan
}

interface LoanRequest { id: string; amount_requested: number; purpose: string; status: string; users: { name: string } | null }

export function PortfolioDashboard() {
  useCurrency() // subscribe to currency changes
  const { user } = useAuth()

  const { data: summary, isLoading } = useQuery({
    queryKey: ['lender-portfolio'],
    queryFn: async () => {
      const { data } = await api.get<PortfolioSummary>('/api/lender/portfolio/summary')
      return data
    },
  })

  const { data: listing } = useQuery({
    queryKey: ['my-listing'],
    queryFn: async () => {
      const { data } = await api.get<{ listing: Listing | null }>('/api/listings/me/listing')
      return data.listing
    },
  })

  const { data: requests } = useQuery({
    queryKey: ['lender-requests'],
    queryFn: async () => {
      const { data } = await api.get<{ requests: LoanRequest[] }>('/api/listings/me/requests')
      return data.requests ?? []
    },
  })

  const { data: commitments } = useQuery({
    queryKey: ['lender-commitments'],
    queryFn: async () => {
      const { data } = await api.get<{ commitments: CommitmentWithLoan[] }>('/api/lender/commitments')
      return data.commitments ?? []
    },
  })

  const pendingRequests = requests?.filter(r => ['submitted', 'under_review'].includes(r.status)) ?? []

  if (isLoading) return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )

  const openLoans = (commitments ?? []).filter(c => ['active', 'repaying'].includes(c.status) || ['active', 'repaying', 'funding', 'fully_funded'].includes(c.loans?.status))

  return (
    <div className="mx-auto max-w-lg">
      <section className="px-6 pb-[26px] pt-[34px] text-center">
        <p className="caps">Capital deployed</p>
        <p className="num mt-3 text-[68px] leading-none tracking-[-0.035em]">{formatCents(summary?.total_committed ?? 0)}</p>
        <div className="mx-auto mt-6 grid max-w-xs grid-cols-[1fr_1px_1fr] items-center">
          <div>
            <p className="num text-2xl text-accent">{formatCents(summary?.total_yield_earned ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Yield earned</p>
          </div>
          <div className="mx-auto h-10 w-px bg-border" />
          <div>
            <p className="num text-2xl">{summary?.active_loans ?? openLoans.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active loans</p>
          </div>
        </div>
      </section>

      <LenderCollections commitments={openLoans} />

      <div className="mt-[22px] flex items-end justify-between border-b border-foreground px-6 pb-2.5">
        <p className="caps">Your offers</p>
        <Link to="/lender/listing" className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> New offer
        </Link>
      </div>
      {listing ? (
        <Link to="/lender/listing" className="grid grid-cols-[92px_1fr_auto] items-center gap-3 border-b border-border px-6 py-3.5 hover:bg-card">
          <p className="num text-[34px] leading-none">{(listing.interest_rate * 100).toFixed(1)}<sup className="text-[0.37em]">%</sup></p>
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">{formatCents(listing.min_loan)} – {formatCents(listing.max_loan)}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {RATE_PERIOD_LABELS[listing.rate_period]} · {openLoans.length} active
              {pendingRequests.length > 0 && <span className="font-serif text-[15px] italic text-accent"> · {pendingRequests.length} new</span>}
            </p>
          </div>
        </Link>
      ) : (
        <Link to="/lender/listing" className="block border-b border-border px-6 py-6 text-[13.5px] font-medium">
          Set your terms. Borrowers apply to this offer.
        </Link>
      )}
      <Link to="/lender/new-loan" className="block border-b border-border px-6 py-3.5 text-[13.5px] text-muted-foreground hover:bg-card">
        Track a loan from chat
      </Link>

      <div className="mt-[22px] flex items-end justify-between border-b border-foreground px-6 pb-2.5">
        <p className="caps">Awaiting your decision</p>
      </div>
      {pendingRequests.length === 0 ? (
        <p className="px-6 py-6 text-[12.5px] text-muted-foreground">No applications waiting.</p>
      ) : pendingRequests.map(request => (
        <Link key={request.id} to="/lender/requests" className="flex min-h-14 items-center gap-3.5 border-b border-border px-6 hover:bg-card">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground font-serif text-lg">{request.users?.name?.[0] ?? '—'}</span>
          <span className="min-w-0 flex-1">
            <span className="num block text-lg">{formatCents(request.amount_requested)}</span>
            <span className="block text-[12.5px] text-muted-foreground">{request.purpose.replaceAll('_', ' ')} · {request.users?.name ?? 'Borrower'}</span>
          </span>
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </Link>
      ))}

      {openLoans.length > 0 && (
        <section className="mt-8 space-y-3 px-6">
          <div className="flex items-end justify-between border-b border-foreground pb-2.5">
            <p className="caps">Open loans</p>
            <Link to="/lender/loans" className="text-[13px] font-semibold text-accent">View all</Link>
          </div>
          {openLoans.slice(0, 5).map(c => (
            <CommitmentCard key={c.id} id={c.id} amount={c.amount} loan={c.loans} />
          ))}
        </section>
      )}
      <p className="sr-only">{user?.name}</p>
    </div>
  )
}
