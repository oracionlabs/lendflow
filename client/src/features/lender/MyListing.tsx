import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'

const RATE_OPTIONS = [
  { value: 'per_15_days', label: '/ 15 days' },
  { value: 'per_30_days', label: '/ 30 days' },
  { value: 'monthly',     label: '/ month' },
  { value: 'annually',    label: '/ year' },
  { value: 'flat',        label: 'flat' },
]

const PURPOSES = Object.entries(LOAN_PURPOSE_LABELS)

interface Listing {
  id?: string
  available_amount: number
  min_loan: number
  max_loan: number
  interest_rate: number
  rate_period: string
  accepted_purposes: string[]
  max_term_months: number | null
  description: string | null
  status: string
}

const EMPTY: Omit<Listing, 'id'> = {
  available_amount: 0,
  min_loan: 10000,
  max_loan: 0,
  interest_rate: 0.05,
  rate_period: 'monthly',
  accepted_purposes: [],
  max_term_months: null,
  description: '',
  status: 'active',
}

export function MyListing() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['my-listing'],
    queryFn: async () => {
      const { data } = await api.get<{ listing: Listing | null }>('/api/listings/me/listing')
      return data.listing
    },
  })

  useEffect(() => {
    if (existing && !loaded) {
      setForm({
        available_amount: existing.available_amount,
        min_loan: existing.min_loan,
        max_loan: existing.max_loan,
        interest_rate: existing.interest_rate,
        rate_period: existing.rate_period,
        accepted_purposes: existing.accepted_purposes ?? [],
        max_term_months: existing.max_term_months,
        description: existing.description ?? '',
        status: existing.status,
      })
      setLoaded(true)
    }
  }, [existing, loaded])

  const save = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/listings/me/listing', {
        ...form,
        max_loan: form.max_loan || form.available_amount,
        max_term_months: form.max_term_months || null,
        description: form.description || null,
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-listing'] })
      toast.success(existing ? 'Listing updated' : 'Listing published')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save'
      toast.error(msg)
    },
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const togglePurpose = (p: string) => {
    setForm(f => ({
      ...f,
      accepted_purposes: f.accepted_purposes.includes(p)
        ? f.accepted_purposes.filter(x => x !== p)
        : [...f.accepted_purposes, p],
    }))
  }

  const isValid = form.available_amount > 0 && form.interest_rate > 0

  if (isLoading) {
    return <div className="max-w-lg mx-auto space-y-4 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted" />)}
    </div>
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Listing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {existing ? 'Your listing is visible to borrowers' : 'Publish your terms so borrowers can find you'}
          </p>
        </div>
        {existing && (
          <div className="flex gap-1.5">
            {(['active', 'paused'] as const).map(s => (
              <button key={s} onClick={() => set('status', s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                  form.status === s ? 'bg-primary text-white' : 'border hover:bg-muted'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Capital */}
      <div className="card-base p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Capital</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">Available to lend</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
            <input type="number"
              value={form.available_amount / 100 || ''}
              onChange={e => set('available_amount', Math.round(parseFloat(e.target.value || '0') * 100))}
              placeholder="50,000"
              className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Minimum loan</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
              <input type="number"
                value={form.min_loan / 100 || ''}
                onChange={e => set('min_loan', Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder="100"
                className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Maximum loan</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
              <input type="number"
                value={form.max_loan / 100 || ''}
                onChange={e => set('max_loan', Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder={`${form.available_amount / 100 || 'No limit'}`}
                className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rate */}
      <div className="card-base p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Interest Rate</h2>

        <div>
          <div className="relative">
            <input type="number"
              value={(form.interest_rate * 100) || ''}
              onChange={e => set('interest_rate', parseFloat(e.target.value || '0') / 100)}
              placeholder="5"
              min={0}
              step={0.5}
              className="w-full rounded-xl border bg-background pl-3 pr-8 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="absolute right-3 top-3 text-muted-foreground text-sm">%</span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {RATE_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => set('rate_period', opt.value)}
              className={`rounded-xl border py-2 text-xs font-medium transition-all ${
                form.rate_period === opt.value ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {form.interest_rate > 0 && (
          <p className="text-sm font-medium text-primary">
            {(form.interest_rate * 100).toFixed(1)}% {RATE_OPTIONS.find(o => o.value === form.rate_period)?.label}
          </p>
        )}
      </div>

      {/* Terms */}
      <div className="card-base p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Terms</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">Max loan duration (months) <span className="text-muted-foreground font-normal">optional</span></label>
          <input type="number"
            value={form.max_term_months ?? ''}
            onChange={e => set('max_term_months', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="No limit"
            min={1}
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">What will you fund? <span className="text-muted-foreground font-normal">(leave blank for anything)</span></label>
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => togglePurpose(val)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  form.accepted_purposes.includes(val)
                    ? 'bg-primary text-white'
                    : 'border border-border hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">About you <span className="text-muted-foreground font-normal">optional</span></label>
          <textarea
            value={form.description ?? ''}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="Tell borrowers a bit about your lending style, what you look for, etc."
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
          />
        </div>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={!isValid || save.isPending}
        className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors"
      >
        {save.isPending ? 'Saving…' : existing ? 'Save Changes' : 'Publish Listing'}
      </button>
    </div>
  )
}
