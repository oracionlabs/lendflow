import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'

const RATE_PERIOD_LABELS: Record<string, string> = {
  per_15_days: '/ 15 days',
  per_30_days: '/ 30 days',
  monthly: '/ month',
  annually: '/ year',
  flat: 'flat',
}

interface Listing {
  id: string
  lender_id: string
  available_amount: number
  min_loan: number
  max_loan: number
  interest_rate: number
  rate_period: string
  accepted_purposes: string[]
  max_term_months: number | null
  description: string | null
  users: { name: string; avatar_url: string | null }
  lender_profiles: { lender_type: string | null; accredited: boolean }
}

const AVATAR_COLORS = ['bg-emerald-100 text-emerald-700', 'bg-blue-100 text-blue-700', 'bg-amber-100 text-amber-700', 'bg-purple-100 text-purple-700', 'bg-teal-100 text-teal-700']

export function BrowseListings() {
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      const { data } = await api.get<{ listings: Listing[] }>('/api/listings')
      return data.listings
    },
  })

  const filtered = (data ?? []).filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      l.users?.name?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) ||
      l.accepted_purposes?.some(p => LOAN_PURPOSE_LABELS[p]?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Find a Lender</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Browse available lenders and their terms</p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lenders, purposes…"
            className="w-full rounded-xl border bg-white pl-9 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`rounded-xl border px-3 flex items-center gap-1.5 text-sm font-medium transition-colors ${showFilters ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-muted'}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
        </button>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">{filtered.length} lender{filtered.length !== 1 ? 's' : ''} available</p>
      )}

      {/* Listing cards */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No lenders found" description="Try adjusting your search or check back later." />
      ) : (
        <div className="space-y-3">
          {filtered.map((listing, i) => {
            const avatarColor = AVATAR_COLORS[listing.users?.name?.charCodeAt(0) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]
            const rateLabel = `${(listing.interest_rate * 100).toFixed(1)}% ${RATE_PERIOD_LABELS[listing.rate_period] ?? ''}`

            return (
              <Link
                key={listing.id}
                to={`/borrower/lenders/${listing.id}`}
                className="block card-base p-4 hover:shadow-card-md transition-shadow active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`h-11 w-11 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 ${avatarColor}`}>
                    {listing.users?.name?.[0]?.toUpperCase() ?? '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{listing.users?.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {listing.lender_profiles?.lender_type ?? 'Individual'} lender
                          {listing.lender_profiles?.accredited && ' · Accredited'}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>

                    {/* Rate — prominent */}
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-primary">{(listing.interest_rate * 100).toFixed(1)}%</span>
                      <span className="text-sm text-muted-foreground">{RATE_PERIOD_LABELS[listing.rate_period]}</span>
                    </div>

                    {/* Key info pills */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                        Up to {formatCents(listing.max_loan ?? listing.available_amount)}
                      </span>
                      {listing.max_term_months && (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                          Max {listing.max_term_months}mo
                        </span>
                      )}
                      {listing.accepted_purposes?.slice(0, 2).map(p => (
                        <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                          {LOAN_PURPOSE_LABELS[p] ?? p}
                        </span>
                      ))}
                      {(listing.accepted_purposes?.length ?? 0) > 2 && (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          +{listing.accepted_purposes.length - 2} more
                        </span>
                      )}
                    </div>

                    {listing.description && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{listing.description}</p>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
