import { useQuery, useMutation } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS, SUPPORTED_TERMS } from '@lendflow/shared'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'

const RATE_PERIOD_LABELS: Record<string, string> = {
  per_15_days: '/ 15 days',
  per_30_days: '/ 30 days',
  monthly: '/ month',
  annually: '/ year',
  flat: 'flat',
}

interface Listing {
  id: string
  available_amount: number
  min_loan: number
  max_loan: number
  interest_rate: number
  rate_period: string
  accepted_purposes: string[]
  max_term_months: number | null
  description: string | null
  users: { name: string }
  lender_profiles: { lender_type: string | null; accredited: boolean }
}

export function ListingDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [applied, setApplied] = useState(false)
  const [form, setForm] = useState({
    amount_requested: 0,
    purpose: 'personal',
    purpose_description: '',
    term_months: 12,
    notes: '',
  })

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const { data } = await api.get<{ listing: Listing }>(`/api/listings/${id}`)
      return data.listing
    },
  })

  const apply = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/listings/${id}/apply`, form)
      return data
    },
    onSuccess: () => setApplied(true),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Application failed'
      toast.error(msg)
    },
  })

  if (isLoading) return <div className="space-y-4 max-w-lg mx-auto"><CardSkeleton /><CardSkeleton /></div>
  if (!listing) return <p className="text-center text-muted-foreground mt-12">Listing not found</p>

  if (applied) {
    return (
      <div className="max-w-sm mx-auto pt-12 text-center space-y-5">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Request sent!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {listing.users?.name} will review your request and get back to you.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/borrower/loans')} className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90">
            View My Loans
          </button>
          <button onClick={() => navigate('/borrower/lenders')} className="flex-1 rounded-xl border py-3 text-sm font-medium hover:bg-muted">
            Back to Lenders
          </button>
        </div>
      </div>
    )
  }

  const availableTerms = SUPPORTED_TERMS.filter(t => !listing.max_term_months || t <= listing.max_term_months)
  const purposes = listing.accepted_purposes?.length ? listing.accepted_purposes : Object.keys(LOAN_PURPOSE_LABELS)

  const isValid = form.amount_requested >= listing.min_loan &&
    (!listing.max_loan || form.amount_requested <= listing.max_loan) &&
    form.term_months > 0

  const amountDollars = form.amount_requested / 100

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Link to="/borrower/lenders" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Lender card */}
      <div className="card-base p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
            {listing.users?.name?.[0]}
          </div>
          <div>
            <p className="font-semibold">{listing.users?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {listing.lender_profiles?.lender_type ?? 'Individual'} lender
              {listing.lender_profiles?.accredited && ' · Accredited'}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-3xl font-bold text-primary">{(listing.interest_rate * 100).toFixed(1)}%</span>
          <span className="text-muted-foreground">{RATE_PERIOD_LABELS[listing.rate_period]}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Min loan</p>
            <p className="font-semibold mt-0.5">{formatCents(listing.min_loan)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Max loan</p>
            <p className="font-semibold mt-0.5">{formatCents(listing.max_loan ?? listing.available_amount)}</p>
          </div>
        </div>

        {listing.description && (
          <p className="text-sm text-muted-foreground">{listing.description}</p>
        )}
      </div>

      {/* Application form */}
      <div className="card-base p-5 space-y-4">
        <h2 className="font-semibold">Apply for a loan</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">How much do you need?</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
            <input
              type="number"
              value={amountDollars || ''}
              onChange={e => setForm(f => ({ ...f, amount_requested: Math.round(parseFloat(e.target.value || '0') * 100) }))}
              placeholder={`${listing.min_loan / 100} – ${(listing.max_loan ?? listing.available_amount) / 100}`}
              min={listing.min_loan / 100}
              max={(listing.max_loan ?? listing.available_amount) / 100}
              className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {form.amount_requested > 0 && form.amount_requested < listing.min_loan && (
            <p className="text-xs text-destructive mt-1">Minimum is {formatCents(listing.min_loan)}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">What's it for?</label>
          <select
            value={form.purpose}
            onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {purposes.map(p => (
              <option key={p} value={p}>{LOAN_PURPOSE_LABELS[p] ?? p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">How long do you need?</label>
          <div className="flex flex-wrap gap-2">
            {availableTerms.map(t => (
              <button key={t} type="button"
                onClick={() => setForm(f => ({ ...f, term_months: t }))}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  form.term_months === t ? 'bg-primary text-white' : 'border border-border hover:bg-muted'
                }`}
              >
                {t}mo
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Anything else? <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Tell the lender about your situation…"
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
          />
        </div>

        <button
          onClick={() => apply.mutate()}
          disabled={!isValid || apply.isPending}
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors"
        >
          {apply.isPending ? 'Sending request…' : `Request loan from ${listing.users?.name?.split(' ')[0]}`}
        </button>
      </div>
    </div>
  )
}
