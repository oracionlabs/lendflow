import { useQuery, useMutation } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { toast } from 'sonner'
import {
  LOAN_PURPOSE_LABELS,
  SUPPORTED_TERMS,
  REPAYMENT_TYPE_LABELS,
  RATE_PERIOD_LABELS,
  type LoanPackage,
} from '@lendflow/shared'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { DatePicker } from '@/components/shared/DatePicker'
import { ArrowLeft, CheckCircle2, Check } from 'lucide-react'
import { format, addDays } from 'date-fns'

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
  listing_packages: LoanPackage[]
  users: { name: string; lender_profiles: { lender_type: string | null; accredited: boolean } | null }
}

export function ListingDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [applied, setApplied] = useState(false)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [dueDateMode, setDueDateMode] = useState<'days' | 'date'>('days')
  const [lumpSumDays, setLumpSumDays] = useState(30)
  const [lumpSumDate, setLumpSumDate] = useState('')
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

  const selectedPkg = listing?.listing_packages?.find(p => p.id === selectedPackageId) ?? null

  // When lump_sum with no fixed term, compute due_date from days or date picker
  const isLumpSum = selectedPkg?.repayment_type === 'lump_sum' && !selectedPkg.term_months
  const isNoPackageFlat = !selectedPkg && listing?.rate_period === 'flat'
  const showDueDateInput = isLumpSum || isNoPackageFlat

  const computedDueDate = showDueDateInput
    ? dueDateMode === 'days'
      ? format(addDays(new Date(), lumpSumDays), 'yyyy-MM-dd')
      : lumpSumDate
    : null

  const apply = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/listings/${id}/apply`, {
        ...form,
        term_months: selectedPkg?.term_months ?? form.term_months,
        package_id: selectedPackageId ?? undefined,
        due_date: computedDueDate ?? undefined,
      })
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

  const packages = listing.listing_packages ?? []
  const hasPackages = packages.length > 0
  const effectiveMinLoan = selectedPkg?.min_loan ?? listing.min_loan
  const effectiveMaxLoan = selectedPkg?.max_loan ?? listing.max_loan
  const availableTerms = SUPPORTED_TERMS.filter(t => !listing.max_term_months || t <= listing.max_term_months)
  const purposes = listing.accepted_purposes?.length ? listing.accepted_purposes : Object.keys(LOAN_PURPOSE_LABELS)
  const amountDollars = form.amount_requested / 100

  const dueDateValid = !showDueDateInput ||
    (dueDateMode === 'days' ? lumpSumDays > 0 : !!lumpSumDate)

  const isValid =
    form.amount_requested >= effectiveMinLoan &&
    (!effectiveMaxLoan || form.amount_requested <= effectiveMaxLoan) &&
    (!hasPackages || !!selectedPackageId) &&
    dueDateValid &&
    (selectedPkg?.repayment_type === 'daily_interest' || showDueDateInput || form.term_months > 0)

  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')

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
              {listing.users?.lender_profiles?.lender_type ?? 'Individual'} lender
              {listing.users?.lender_profiles?.accredited && ' · Accredited'}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-3xl font-bold text-primary">{(listing.interest_rate * 100).toFixed(1)}%</span>
          <span className="text-muted-foreground">{RATE_PERIOD_LABELS[listing.rate_period as keyof typeof RATE_PERIOD_LABELS] ?? listing.rate_period}</span>
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

      {/* Package selection */}
      {hasPackages && (
        <div className="card-base p-5 space-y-3">
          <h2 className="font-semibold">Choose a package</h2>
          <p className="text-xs text-muted-foreground -mt-1">Select the loan terms that work for you</p>
          <div className="space-y-2">
            {packages.map(pkg => {
              const isSelected = selectedPackageId === pkg.id
              return (
                <button key={pkg.id} type="button" onClick={() => setSelectedPackageId(isSelected ? null : pkg.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{pkg.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                        }`}>
                          {REPAYMENT_TYPE_LABELS[pkg.repayment_type]}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{(pkg.interest_rate * 100).toFixed(1)}%{RATE_PERIOD_LABELS[pkg.rate_period as keyof typeof RATE_PERIOD_LABELS]}</span>
                        {pkg.term_months && <span>{pkg.term_months} months</span>}
                        {pkg.max_term_days && <span>Up to {pkg.max_term_days} days</span>}
                        {pkg.payment_frequency && <span className="capitalize">{pkg.payment_frequency.replace('_', '-')} payments</span>}
                        {pkg.min_loan && <span>Min {formatCents(pkg.min_loan)}</span>}
                      </div>
                      {pkg.description && <p className="text-xs text-muted-foreground mt-1">{pkg.description}</p>}
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {!selectedPackageId && (
            <p className="text-xs text-muted-foreground text-center">Select a package above to proceed</p>
          )}
        </div>
      )}

      {/* Application form */}
      <div className="card-base p-5 space-y-4">
        <h2 className="font-semibold">Apply for a loan</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">How much do you need?</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
            <input type="number" value={amountDollars || ''}
              onChange={e => setForm(f => ({ ...f, amount_requested: Math.round(parseFloat(e.target.value || '0') * 100) }))}
              placeholder={`${effectiveMinLoan / 100} – ${(effectiveMaxLoan ?? listing.available_amount) / 100}`}
              min={effectiveMinLoan / 100} max={(effectiveMaxLoan ?? listing.available_amount) / 100}
              className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </div>
          {form.amount_requested > 0 && form.amount_requested < effectiveMinLoan && (
            <p className="text-xs text-destructive mt-1">Minimum is {formatCents(effectiveMinLoan)}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">What's it for?</label>
          <select value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {purposes.map(p => <option key={p} value={p}>{LOAN_PURPOSE_LABELS[p] ?? p}</option>)}
          </select>
        </div>

        {/* Due date input for lump_sum / flat rate */}
        {showDueDateInput ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">When will you repay?</label>
              <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
                <button type="button" onClick={() => setDueDateMode('days')}
                  className={`px-3 py-1.5 transition-colors ${dueDateMode === 'days' ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground'}`}>
                  Days
                </button>
                <button type="button" onClick={() => setDueDateMode('date')}
                  className={`px-3 py-1.5 border-l transition-colors ${dueDateMode === 'date' ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground'}`}>
                  Date
                </button>
              </div>
            </div>
            {dueDateMode === 'days' ? (
              <>
                <div className="relative">
                  <input type="number" value={lumpSumDays || ''} min={1}
                    onChange={e => setLumpSumDays(parseInt(e.target.value || '1'))}
                    placeholder="30"
                    className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                  <span className="absolute right-3 top-3 text-xs text-muted-foreground">days</span>
                </div>
                {lumpSumDays > 0 && (
                  <p className="text-xs text-muted-foreground">Due on <span className="font-medium text-foreground">{computedDueDate}</span></p>
                )}
              </>
            ) : (
              <>
                <DatePicker value={lumpSumDate} onChange={setLumpSumDate} min={tomorrow} placeholder="Select repayment date" />
                {lumpSumDate && (
                  <p className="text-xs text-muted-foreground">
                    {Math.round((new Date(lumpSumDate).getTime() - Date.now()) / 86400000)} days from today
                  </p>
                )}
              </>
            )}
          </div>
        ) : selectedPkg?.repayment_type === 'daily_interest' ? (
          <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">Flexible repayment</p>
            <p className="text-xs text-muted-foreground mt-0.5">Repay anytime within {selectedPkg.max_term_days} days — interest accrues daily</p>
          </div>
        ) : selectedPkg?.term_months ? (
          <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
            <p className="text-muted-foreground">Term: <span className="font-semibold text-foreground">{selectedPkg.term_months} months</span></p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-2">How long do you need?</label>
            <div className="flex flex-wrap gap-2">
              {availableTerms.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, term_months: t }))}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    form.term_months === t ? 'bg-primary text-white' : 'border border-border hover:bg-muted'
                  }`}>
                  {t}mo
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Anything else? <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            placeholder="Tell the lender about your situation…"
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none" />
        </div>

        <button onClick={() => apply.mutate()} disabled={!isValid || apply.isPending}
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors">
          {apply.isPending ? 'Sending request…' : `Request loan from ${listing.users?.name?.split(' ')[0]}`}
        </button>
        {hasPackages && !selectedPackageId && (
          <p className="text-xs text-center text-muted-foreground">Select a package above to enable this button</p>
        )}
      </div>
    </div>
  )
}
