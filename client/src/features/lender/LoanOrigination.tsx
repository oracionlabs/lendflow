import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS, SUPPORTED_TERMS } from '@lendflow/shared'
import { CheckCircle2 } from 'lucide-react'

const PURPOSES = Object.entries(LOAN_PURPOSE_LABELS)

interface NewLoanResult {
  loan: {
    id: string
    amount_requested: number
    interest_rate: number
    monthly_payment: number
    term_months: number
    purpose: string
  }
  borrower_created: boolean
}

export function LoanOrigination() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    borrower_name: '',
    borrower_email: '',
    purpose: 'personal',
    notes: '',
    amount_requested: 1000000,
    term_months: 24,
  })
  const [result, setResult] = useState<NewLoanResult | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<NewLoanResult>('/api/lender/loans/new', form)
      return data
    },
    onSuccess: (data) => setResult(data),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Something went wrong'
      toast.error(msg)
    },
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  if (result) {
    return (
      <div className="max-w-md mx-auto pt-12 text-center space-y-5">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold">Loan created</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {formatCents(result.loan.amount_requested)} · {result.loan.term_months} months ·{' '}
            {((result.loan.interest_rate ?? 0) * 100).toFixed(1)}% p.a.
          </p>
          {result.borrower_created && (
            <p className="text-sm text-muted-foreground mt-2">
              A borrower account was created. They'll receive an email to set their password.
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/lender/opportunities')}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            View Opportunities
          </button>
          <button
            onClick={() => { setResult(null); setForm({ borrower_name: '', borrower_email: '', purpose: 'personal', notes: '', amount_requested: 1000000, term_months: 24 }) }}
            className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted"
          >
            New Loan
          </button>
        </div>
      </div>
    )
  }

  const isValid = form.borrower_name.trim() && form.borrower_email.trim() && form.amount_requested > 0

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">New Loan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Fill in the details below to create a loan.</p>
      </div>

      <div className="card-base p-6 space-y-5">
        {/* Borrower */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Borrower</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Full Name</label>
              <input
                type="text"
                value={form.borrower_name}
                onChange={set('borrower_name')}
                placeholder="Jane Smith"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={form.borrower_email}
                onChange={set('borrower_email')}
                placeholder="jane@example.com"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">If they don't have an account yet, one will be created for them.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Loan details */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Loan Details</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={form.amount_requested / 100}
                  onChange={e => setForm(f => ({ ...f, amount_requested: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                  min={1000}
                  step={500}
                  placeholder="10,000"
                  className="w-full rounded-lg border bg-background pl-7 pr-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Purpose</label>
              <select
                value={form.purpose}
                onChange={set('purpose')}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {PURPOSES.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Term</label>
              <div className="flex gap-2 flex-wrap">
                {SUPPORTED_TERMS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, term_months: t }))}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      form.term_months === t ? 'bg-primary text-white' : 'border border-border hover:bg-muted'
                    }`}
                  >
                    {t}mo
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={2}
                placeholder="Any context about this loan…"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => create.mutate()}
        disabled={!isValid || create.isPending}
        className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors"
      >
        {create.isPending ? 'Creating…' : 'Create Loan'}
      </button>
    </div>
  )
}
