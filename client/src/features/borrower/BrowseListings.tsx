import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, useCurrency } from '@/lib/utils'
import { SlidersHorizontal } from 'lucide-react'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'

const RATE_PERIOD_LABELS: Record<string, string> = {
  per_15_days: '/ 15 days', per_30_days: '/ 30 days',
  monthly: '/ month', annually: '/ year', flat: 'flat', daily: '/ day',
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
  listing_packages: { id: string }[]
  users: { name: string; avatar_url: string | null; lender_profiles: { lender_type: string | null; accredited: boolean } | null }
}

export function BrowseListings() {
  useCurrency() // subscribe to currency changes
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      const { data } = await api.get<{ listings: Listing[] }>('/api/listings')
      return data.listings
    },
  })

  const ranked = [...(data ?? [])].sort((a, b) => a.interest_rate - b.interest_rate)
  const filtered = ranked.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      l.users?.name?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) ||
      l.accepted_purposes?.some(p => LOAN_PURPOSE_LABELS[p]?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex justify-end px-3.5">
        <button
          type="button"
          onClick={() => setShowFilters(open => !open)}
          aria-label="Filter"
          className="flex h-11 w-11 items-center justify-center text-foreground"
        >
          <SlidersHorizontal className="h-5 w-5" strokeWidth={1.4} />
        </button>
      </div>
      {showFilters && (
        <div className="px-6 pb-2">
          <label className="caps text-[10px] text-muted-foreground" htmlFor="lender-search">Search</label>
          <input
            id="lender-search"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Lender or purpose"
            className="mt-1 w-full border-0 border-b border-foreground bg-transparent px-0 py-2 font-serif text-[22px] shadow-none"
          />
        </div>
      )}

      <div className="px-6 pb-[22px] pt-[26px]">
        <p className="caps">Your request</p>
        <p className="mt-2.5 font-serif text-[27px] leading-[1.3] tracking-[-0.01em]">
          {search
            ? <>Showing offers matching <span className="italic text-accent underline decoration-accent underline-offset-4">{search}</span>.</>
            : 'Showing every open offer, lowest rate first.'}
        </p>
      </div>

      <div className="flex items-end justify-between border-b border-foreground px-6 pb-2.5">
        <p className="caps">{isLoading ? 'Offers' : filtered.length === 0 ? 'No offers' : `${filtered.length} offer${filtered.length === 1 ? '' : 's'}`}</p>
        <p className="caps text-muted-foreground">By rate</p>
      </div>

      {isLoading ? (
        <div role="status" className="px-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[104px_1fr_auto] items-center gap-3 border-b border-border py-4">
              <div className="h-7 w-16 bg-border" />
              <div className="space-y-2">
                <div className="h-3 w-[70%] bg-border" />
                <div className="h-3 w-[45%] bg-border" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 pt-14 text-center">
          <p className="font-serif text-2xl">No lenders match {search || 'this request'}.</p>
          <button type="button" onClick={() => setSearch('')} className="mt-6 text-sm font-semibold text-accent">Clear the search</button>
        </div>
      ) : (
        <div>
          {filtered.map((listing, index) => {
            const rate = (listing.interest_rate * 100).toFixed(1)
            const range = `${formatCents(listing.min_loan)} · ${listing.max_term_months ? `${listing.max_term_months} mo` : 'Open term'}`
            const kind = listing.users?.lender_profiles?.lender_type ?? 'Individual'
            return (
              <Link
                key={listing.id}
                to={`/borrower/lenders/${listing.id}`}
                className="grid min-h-[84px] grid-cols-[104px_1fr_auto] items-center gap-3 border-b border-border px-6 py-4 hover:bg-card"
              >
                <p className="num text-[34px] leading-none md:text-[34px]">
                  {rate}<sup className="ml-0.5 align-super text-[0.37em]">%</sup>
                </p>
                <div className="min-w-0">
                  <p className={`caps text-[10px] ${index === 0 ? 'text-accent' : 'text-foreground'}`}>
                    {index === 0 ? 'Lowest rate' : (RATE_PERIOD_LABELS[listing.rate_period] ?? 'Offer')}
                  </p>
                  <p className="mt-1 truncate text-[13.5px] font-medium capitalize">{listing.users?.name} · {kind}</p>
                  <p className="text-[12.5px] text-muted-foreground">{range}</p>
                </div>
                <div className="text-right">
                  <p className="num text-xl leading-none">{formatCents(listing.max_loan ?? listing.available_amount)}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">up to</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
