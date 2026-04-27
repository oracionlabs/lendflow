import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { formatCents, formatPercent } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { FundingCommitment } from '@lendflow/shared'
import { ChevronRight, TrendingUp, Users, Settings2 } from 'lucide-react'

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
  loans: { purpose: string; term_months: number; interest_rate: number; ai_credit_grade?: string; admin_override_grade?: string; status: string }
}

interface LoanRequest { id: string; amount_requested: number; purpose: string; status: string; users: { name: string } | null }

export function PortfolioDashboard() {
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
    <div className="space-y-4 max-w-lg mx-auto">
      {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold">Hi, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {listing ? `Your listing is ${listing.status}` : 'Set up your listing to start receiving requests'}
        </p>
      </div>

      {/* My Listing status card */}
      {listing ? (
        <Link to="/lender/listing" className="block card-base p-5 active:scale-[0.99] transition-transform">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2 w-2 rounded-full ${listing.status === 'active' ? 'bg-primary' : 'bg-amber-400'}`} />
                <span className="text-xs font-medium capitalize text-muted-foreground">{listing.status}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-primary">{(listing.interest_rate * 100).toFixed(1)}%</span>
                <span className="text-sm text-muted-foreground">{RATE_PERIOD_LABELS[listing.rate_period]}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCents(listing.min_loan)} – {formatCents(listing.max_loan)} · {formatCents(listing.available_amount)} available
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </Link>
      ) : (
        <Link to="/lender/listing"
          className="flex items-center justify-between rounded-2xl border-2 border-dashed border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors group">
          <div>
            <p className="font-semibold group-hover:text-primary transition-colors">Create Your Listing</p>
            <p className="text-sm text-muted-foreground mt-0.5">Set your rate and available capital</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
        </Link>
      )}

      {/* Pending requests alert */}
      {pendingRequests.length > 0 && (
        <Link to="/lender/requests"
          className="flex items-center gap-3 rounded-2xl p-4 active:scale-[0.99] transition-transform"
          style={{ background: 'hsl(var(--lime))' }}>
          <div className="h-10 w-10 rounded-full bg-black/10 flex items-center justify-center flex-shrink-0">
            <span className="font-bold text-sm text-foreground">{pendingRequests.length}</span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground">
              {pendingRequests.length} new request{pendingRequests.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-foreground/70">Tap to review and accept</p>
          </div>
          <ChevronRight className="h-4 w-4 text-foreground/70" />
        </Link>
      )}

      {/* Portfolio KPIs */}
      {(summary?.active_loans ?? 0) > 0 && (
        <section>
          <h2 className="font-semibold text-sm mb-2">Portfolio</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Active Loans', value: String(summary?.active_loans ?? 0), sub: 'commitments' },
              { label: 'Committed', value: formatCents(summary?.total_committed ?? 0), sub: 'deployed' },
              { label: 'Yield Earned', value: formatCents(summary?.total_yield_earned ?? 0), sub: 'interest income', accent: true },
              { label: 'Projected', value: formatCents(summary?.projected_future_yield ?? 0), sub: 'remaining yield' },
            ].map(({ label, value, sub, accent }) => (
              <div key={label} className="card-dark p-4">
                <p className="text-xs text-white/50">{label}</p>
                <p className={`text-lg font-bold mt-0.5 ${accent ? '' : 'text-white'}`}
                  style={accent ? { color: 'hsl(var(--lime))' } : {}}>
                  {value}
                </p>
                <p className="text-[11px] text-white/40">{sub}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active commitments */}
      {(commitments?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm">Active Loans</h2>
            <Link to="/lender/loans" className="text-xs text-primary">View all</Link>
          </div>
          <div className="space-y-2">
            {(commitments ?? []).filter(c => c.status === 'active').slice(0, 3).map(c => (
              <Link key={c.id} to={`/lender/commitments/${c.id}`}
                className="flex items-center justify-between card-base p-4 active:scale-[0.99] transition-transform">
                <div>
                  <p className="font-medium text-sm">{LOAN_PURPOSE_LABELS[c.loans?.purpose] ?? c.loans?.purpose}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(c.amount)} · {formatPercent(c.loans?.interest_rate ?? 0)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CreditGradeBadge grade={c.loans?.admin_override_grade ?? c.loans?.ai_credit_grade} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty — no listing, no loans */}
      {!listing && !(commitments?.length) && (
        <div className="text-center py-8 space-y-2">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="font-medium">Start lending</p>
          <p className="text-sm text-muted-foreground">Create a listing to let borrowers find you</p>
          <Link to="/lender/listing"
            className="inline-block mt-2 rounded-full px-6 py-2.5 text-sm font-semibold hover:brightness-105 transition-all"
            style={{ background: 'hsl(var(--lime))', color: 'hsl(var(--lime-foreground))' }}>
            Create Listing
          </Link>
        </div>
      )}
    </div>
  )
}
