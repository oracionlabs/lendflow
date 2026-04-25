import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatPercent } from '@/lib/utils'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS, SUPPORTED_TERMS } from '@lendflow/shared'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { Search, User, CheckCircle2 } from 'lucide-react'

interface Borrower {
  id: string
  name: string
  email: string
  created_at: string
  borrower_profiles: {
    employment_status?: string
    annual_income?: number
    credit_score_range?: string
    identity_verified?: boolean
  } | null
}

interface OriginationResult {
  loan: { id: string; status: string; interest_rate: number; monthly_payment: number; total_repayment: number }
  assessment: { grade: string; confidence: number; reasoning: string } | null
}

const AVATAR_COLORS = ['avatar-green', 'avatar-blue', 'avatar-amber', 'avatar-purple', 'avatar-teal', 'avatar-red']

export function LoanOrigination() {
  const navigate = useNavigate()
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    purpose: 'personal',
    purpose_description: '',
    amount_requested: 1000000,
    term_months: 24,
  })
  const [result, setResult] = useState<OriginationResult | null>(null)

  const { data: borrowers, isLoading: borrowersLoading } = useQuery({
    queryKey: ['lender-borrowers'],
    queryFn: async () => {
      const { data } = await api.get<{ borrowers: Borrower[] }>('/api/lender/borrowers')
      return data.borrowers
    },
  })

  const originate = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<OriginationResult>('/api/lender/originate', {
        borrower_id: selectedBorrower!.id,
        ...form,
      })
      return data
    },
    onSuccess: (data) => {
      setResult(data)
      toast.success('Loan originated successfully')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Origination failed'
      toast.error(msg)
    },
  })

  const filtered = (borrowers ?? []).filter(b =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.email.toLowerCase().includes(search.toLowerCase())
  )

  if (result) {
    const loan = result.loan
    return (
      <div className="max-w-xl mx-auto py-8 text-center space-y-6">
        <div className="flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Loan Originated</h1>
          <p className="text-muted-foreground mt-1">
            The loan has been created and is now in <strong>Approved</strong> status. You can fund it from the opportunities board.
          </p>
        </div>
        {result.assessment && (
          <div className="card-base p-5 text-left space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">AI Credit Assessment</p>
              <CreditGradeBadge grade={result.assessment.grade} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Rate</p>
                <p className="font-bold text-primary">{formatPercent(loan.interest_rate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="font-bold">{formatCents(loan.monthly_payment)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Repayment</p>
                <p className="font-bold">{formatCents(loan.total_repayment)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{result.assessment.reasoning}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/lender/opportunities')}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Fund This Loan
          </button>
          <button
            onClick={() => { setResult(null); setSelectedBorrower(null); setSearch('') }}
            className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted"
          >
            Originate Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Originate a Loan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create a loan on behalf of a borrower. The AI will assess their credit profile automatically.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_1.2fr] gap-6">
        {/* Step 1 — Select borrower */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
            <h2 className="font-semibold text-sm">Select Borrower</h2>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {borrowersLoading ? (
              <CardSkeleton />
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No borrowers found</p>
            ) : filtered.map((b, i) => {
              const bp = b.borrower_profiles
              const avatarColor = AVATAR_COLORS[b.name.charCodeAt(0) % AVATAR_COLORS.length]
              const isSelected = selectedBorrower?.id === b.id
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBorrower(b)}
                  className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all ${
                    isSelected ? 'ring-2 ring-primary bg-primary/5 shadow-sm' : 'card-base hover:shadow-card-md'
                  }`}
                >
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${avatarColor}`}>
                    {b.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{b.email}</p>
                    {bp?.credit_score_range && (
                      <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{bp.credit_score_range.replace('_', ' ')} credit</p>
                    )}
                  </div>
                  {bp?.identity_verified && (
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2 — Loan details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${selectedBorrower ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>2</div>
            <h2 className={`font-semibold text-sm ${!selectedBorrower ? 'text-muted-foreground' : ''}`}>Loan Details</h2>
          </div>

          {!selectedBorrower ? (
            <div className="card-base p-8 text-center">
              <User className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a borrower first</p>
            </div>
          ) : (
            <div className="card-base p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${AVATAR_COLORS[selectedBorrower.name.charCodeAt(0) % AVATAR_COLORS.length]}`}>
                  {selectedBorrower.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{selectedBorrower.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedBorrower.email}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Purpose</label>
                <select
                  value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {Object.entries(LOAN_PURPOSE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={form.purpose_description}
                  onChange={e => setForm(f => ({ ...f, purpose_description: e.target.value }))}
                  placeholder="e.g. Equipment purchase for manufacturing"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Loan Amount — <span className="text-foreground font-semibold">{formatCents(form.amount_requested)}</span>
                </label>
                <input
                  type="range"
                  min={100000}
                  max={5000000}
                  step={50000}
                  value={form.amount_requested}
                  onChange={e => setForm(f => ({ ...f, amount_requested: parseInt(e.target.value) }))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>$1,000</span><span>$50,000</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Term</label>
                <div className="flex gap-2 flex-wrap">
                  {SUPPORTED_TERMS.map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, term_months: t }))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${form.term_months === t ? 'bg-primary text-white' : 'border border-border hover:bg-muted'}`}
                    >
                      {t}mo
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => originate.mutate()}
                disabled={originate.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm"
              >
                {originate.isPending ? 'Running AI Assessment…' : 'Originate Loan'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
