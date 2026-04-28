import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { toast } from 'sonner'
import {
  LOAN_PURPOSE_LABELS,
  REPAYMENT_TYPE_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  type LoanPackage,
  type RepaymentType,
  type PaymentFrequency,
} from '@lendflow/shared'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'

const RATE_OPTIONS = [
  { value: 'per_15_days', label: '/ 15 days' },
  { value: 'per_30_days', label: '/ 30 days' },
  { value: 'monthly',     label: '/ month' },
  { value: 'annually',    label: '/ year' },
  { value: 'flat',        label: 'flat' },
  { value: 'daily',       label: '/ day' },
]

const REPAYMENT_TYPES: { value: RepaymentType; label: string; hint: string }[] = [
  { value: 'installments',    label: 'Monthly Installments', hint: 'Fixed payment each month' },
  { value: 'lump_sum',        label: 'Single Repayment',     hint: 'Full amount on due date' },
  { value: 'interest_only',   label: 'Interest-Only',        hint: 'Interest monthly + balloon' },
  { value: 'daily_interest',  label: 'Daily Interest',       hint: 'Accrues daily, flexible repay' },
  { value: 'custom_schedule', label: 'Custom Schedule',      hint: 'Choose payment frequency' },
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
  available_amount: 0, min_loan: 10000, max_loan: 0,
  interest_rate: 0.05, rate_period: 'monthly',
  accepted_purposes: [], max_term_months: null, description: '', status: 'active',
}

const EMPTY_PKG: Omit<LoanPackage, 'id' | 'listing_id' | 'created_at' | 'updated_at'> = {
  name: '', description: null, repayment_type: 'installments',
  interest_rate: 0.05, rate_period: 'monthly',
  term_months: 12, max_term_days: null, payment_frequency: null,
  min_loan: null, max_loan: null, sort_order: 0,
}

export function MyListing() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [pkgForm, setPkgForm] = useState(EMPTY_PKG)
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null)
  const [showPkgForm, setShowPkgForm] = useState(false)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['my-listing'],
    queryFn: async () => {
      const { data } = await api.get<{ listing: Listing | null }>('/api/listings/me/listing')
      return data.listing
    },
  })

  const { data: packages } = useQuery({
    queryKey: ['listing-packages', (existing as { id?: string } | null)?.id],
    queryFn: async () => {
      const { data } = await api.get<{ packages: LoanPackage[] }>(`/api/listings/${(existing as { id: string }).id}/packages`)
      return data.packages
    },
    enabled: !!(existing as { id?: string } | null)?.id,
  })

  useEffect(() => {
    if (existing && !loaded) {
      setForm({
        available_amount: existing.available_amount, min_loan: existing.min_loan,
        max_loan: existing.max_loan, interest_rate: existing.interest_rate,
        rate_period: existing.rate_period, accepted_purposes: existing.accepted_purposes ?? [],
        max_term_months: existing.max_term_months, description: existing.description ?? '',
        status: existing.status,
      })
      setLoaded(true)
    }
  }, [existing, loaded])

  const save = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/listings/me/listing', {
        ...form, max_loan: form.max_loan || form.available_amount,
        max_term_months: form.max_term_months || null, description: form.description || null,
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-listing'] })
      toast.success(existing ? 'Listing updated' : 'Listing published')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
    },
  })

  const savePkg = useMutation({
    mutationFn: async () => {
      const listingId = (existing as { id: string }).id
      if (editingPkgId) {
        await api.put(`/api/listings/${listingId}/packages/${editingPkgId}`, pkgForm)
      } else {
        await api.post(`/api/listings/${listingId}/packages`, pkgForm)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listing-packages', (existing as { id: string }).id] })
      setShowPkgForm(false)
      setEditingPkgId(null)
      setPkgForm(EMPTY_PKG)
      toast.success(editingPkgId ? 'Package updated' : 'Package added')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save package')
    },
  })

  const deletePkg = useMutation({
    mutationFn: async (pkgId: string) => {
      await api.delete(`/api/listings/${(existing as { id: string }).id}/packages/${pkgId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listing-packages', (existing as { id: string }).id] })
      toast.success('Package removed')
    },
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))
  const setPkg = <K extends keyof typeof pkgForm>(k: K, v: typeof pkgForm[K]) => setPkgForm(f => ({ ...f, [k]: v }))

  const togglePurpose = (p: string) => {
    setForm(f => ({
      ...f,
      accepted_purposes: f.accepted_purposes.includes(p)
        ? f.accepted_purposes.filter(x => x !== p)
        : [...f.accepted_purposes, p],
    }))
  }

  const startEditPkg = (pkg: LoanPackage) => {
    setPkgForm({
      name: pkg.name, description: pkg.description, repayment_type: pkg.repayment_type,
      interest_rate: pkg.interest_rate, rate_period: pkg.rate_period,
      term_months: pkg.term_months, max_term_days: pkg.max_term_days,
      payment_frequency: pkg.payment_frequency, min_loan: pkg.min_loan,
      max_loan: pkg.max_loan, sort_order: pkg.sort_order,
    })
    setEditingPkgId(pkg.id)
    setShowPkgForm(true)
  }

  const cancelPkg = () => {
    setShowPkgForm(false)
    setEditingPkgId(null)
    setPkgForm(EMPTY_PKG)
  }

  const pkgValid = pkgForm.name.trim().length > 0 && pkgForm.interest_rate > 0 &&
    (['installments', 'interest_only'].includes(pkgForm.repayment_type) ? !!pkgForm.term_months : true) &&
    (pkgForm.repayment_type === 'daily_interest' ? !!pkgForm.max_term_days : true) &&
    (pkgForm.repayment_type === 'custom_schedule' ? !!pkgForm.term_months && !!pkgForm.payment_frequency : true)

  const isValid = form.available_amount > 0 && form.interest_rate > 0
  const listingId = (existing as { id?: string } | null)?.id

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
                }`}>{s}</button>
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
            <input type="number" value={form.available_amount / 100 || ''}
              onChange={e => set('available_amount', Math.round(parseFloat(e.target.value || '0') * 100))}
              placeholder="50,000"
              className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['Minimum loan', 'min_loan', '100'] as const, ['Maximum loan', 'max_loan', `${form.available_amount / 100 || 'No limit'}`] as const].map(([label, key, placeholder]) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1.5">{label}</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
                <input type="number" value={form[key] / 100 || ''}
                  onChange={e => set(key, Math.round(parseFloat(e.target.value || '0') * 100))}
                  placeholder={placeholder}
                  className="w-full rounded-xl border bg-background pl-7 pr-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default Rate */}
      <div className="card-base p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Default Interest Rate</h2>
        <div className="relative">
          <input type="number" value={(form.interest_rate * 100) || ''}
            onChange={e => set('interest_rate', parseFloat(e.target.value || '0') / 100)}
            placeholder="5" min={0} step={0.5}
            className="w-full rounded-xl border bg-background pl-3 pr-8 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          <span className="absolute right-3 top-3 text-muted-foreground text-sm">%</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {RATE_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => set('rate_period', opt.value)}
              className={`rounded-xl border py-2 text-xs font-medium transition-all ${
                form.rate_period === opt.value ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'
              }`}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Terms */}
      <div className="card-base p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Terms</h2>
        <div>
          <label className="block text-sm font-medium mb-1.5">Max loan duration (months) <span className="text-muted-foreground font-normal">optional</span></label>
          <input type="number" value={form.max_term_months ?? ''}
            onChange={e => set('max_term_months', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="No limit" min={1}
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">What will you fund? <span className="text-muted-foreground font-normal">(leave blank for anything)</span></label>
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map(([val, label]) => (
              <button key={val} type="button" onClick={() => togglePurpose(val)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  form.accepted_purposes.includes(val) ? 'bg-primary text-white' : 'border border-border hover:bg-muted'
                }`}>{label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">About you <span className="text-muted-foreground font-normal">optional</span></label>
          <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={3}
            placeholder="Tell borrowers a bit about your lending style…"
            className="w-full rounded-xl border bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none" />
        </div>
      </div>

      <button onClick={() => save.mutate()} disabled={!isValid || save.isPending}
        className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors">
        {save.isPending ? 'Saving…' : existing ? 'Save Changes' : 'Publish Listing'}
      </button>

      {/* ─── Packages (only shown after listing is saved) ─── */}
      {listingId && (
        <div className="card-base p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Loan Packages</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Offer borrowers different term options to choose from</p>
            </div>
            {!showPkgForm && (
              <button onClick={() => { setPkgForm(EMPTY_PKG); setEditingPkgId(null); setShowPkgForm(true) }}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Package
              </button>
            )}
          </div>

          {/* Package list */}
          {(packages ?? []).length > 0 && !showPkgForm && (
            <div className="space-y-2">
              {packages!.map(pkg => (
                <div key={pkg.id} className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{pkg.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {REPAYMENT_TYPE_LABELS[pkg.repayment_type]} · {(pkg.interest_rate * 100).toFixed(1)}%
                      {RATE_OPTIONS.find(o => o.value === pkg.rate_period)?.label}
                      {pkg.term_months ? ` · ${pkg.term_months}mo` : ''}
                      {pkg.max_term_days ? ` · up to ${pkg.max_term_days}d` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => startEditPkg(pkg)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deletePkg.mutate(pkg.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(packages ?? []).length === 0 && !showPkgForm && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No packages yet. Add one to give borrowers structured options.
            </p>
          )}

          {/* Package form */}
          {showPkgForm && (
            <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">{editingPkgId ? 'Edit Package' : 'New Package'}</p>

              <div>
                <label className="block text-xs font-medium mb-1">Package name</label>
                <input type="text" value={pkgForm.name} onChange={e => setPkg('name', e.target.value)}
                  placeholder="e.g. 30-Day Bridge Loan"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">Repayment type</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {REPAYMENT_TYPES.map(rt => (
                    <button key={rt.value} type="button" onClick={() => setPkg('repayment_type', rt.value)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-all ${
                        pkgForm.repayment_type === rt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                      }`}>
                      <span className="text-sm font-medium">{rt.label}</span>
                      <span className="text-xs text-muted-foreground">{rt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Interest rate</label>
                  <div className="relative">
                    <input type="number" value={(pkgForm.interest_rate * 100) || ''}
                      onChange={e => setPkg('interest_rate', parseFloat(e.target.value || '0') / 100)}
                      min={0} step={0.1}
                      className="w-full rounded-lg border bg-background pl-3 pr-7 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                    <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Rate period</label>
                  <select value={pkgForm.rate_period} onChange={e => setPkg('rate_period', e.target.value as LoanPackage['rate_period'])}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {RATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Conditional term fields */}
              {['installments', 'interest_only', 'custom_schedule'].includes(pkgForm.repayment_type) && (
                <div>
                  <label className="block text-xs font-medium mb-1">Term (months)</label>
                  <input type="number" value={pkgForm.term_months ?? ''} min={1}
                    onChange={e => setPkg('term_months', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                </div>
              )}
              {pkgForm.repayment_type === 'daily_interest' && (
                <div>
                  <label className="block text-xs font-medium mb-1">Max repayment period (days)</label>
                  <input type="number" value={pkgForm.max_term_days ?? ''} min={1}
                    onChange={e => setPkg('max_term_days', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                </div>
              )}
              {pkgForm.repayment_type === 'custom_schedule' && (
                <div>
                  <label className="block text-xs font-medium mb-1">Payment frequency</label>
                  <select value={pkgForm.payment_frequency ?? ''} onChange={e => setPkg('payment_frequency', e.target.value as PaymentFrequency)}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <option value="">Select frequency</option>
                    {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1">Description <span className="text-muted-foreground font-normal">optional</span></label>
                <textarea value={pkgForm.description ?? ''} onChange={e => setPkg('description', e.target.value || null)} rows={2}
                  placeholder="Brief description of this package for borrowers"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => savePkg.mutate()} disabled={!pkgValid || savePkg.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  <Check className="h-3.5 w-3.5" /> {savePkg.isPending ? 'Saving…' : 'Save Package'}
                </button>
                <button onClick={cancelPkg} className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
