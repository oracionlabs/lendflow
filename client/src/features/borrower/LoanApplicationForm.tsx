import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { toast } from 'sonner'
import { formatCents, formatPercent } from '@/lib/utils'
import { LOAN_PURPOSE_LABELS, SUPPORTED_TERMS } from '@lendflow/shared'

type Step = 1 | 2 | 3 | 4

const purposes = Object.entries(LOAN_PURPOSE_LABELS)

export function LoanApplicationForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    amount_requested: 500000,
    purpose: 'personal',
    purpose_description: '',
    term_months: 24,
    annual_income: 0,
    monthly_expenses: 0,
    employment_status: 'employed',
  })

  const [preview, setPreview] = useState<{ monthly_payment: number; interest_rate: number } | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  useEffect(() => {
    if (form.amount_requested > 0 && form.term_months > 0) {
      api.get('/api/loans/preview', {
        params: { amount: form.amount_requested, term_months: form.term_months },
      }).then(({ data }) => setPreview(data)).catch(() => null)
    }
  }, [form.amount_requested, form.term_months])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      let loanId = draftId

      if (!loanId) {
        const { data } = await api.post('/api/loans', {
          amount_requested: form.amount_requested,
          purpose: form.purpose,
          purpose_description: form.purpose_description,
          term_months: form.term_months,
        })
        loanId = data.loan.id
        setDraftId(loanId)
      }

      await api.post(`/api/loans/${loanId}/submit`)
      toast.success('Application submitted! We\'ll review it within 1–2 business days.')
      navigate('/borrower')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Submission failed'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Apply for a Loan</h1>
        <div className="mt-4 flex items-center gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${s <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {s}
              </div>
              {s < 4 && <div className={`h-0.5 w-12 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            {['Loan Details', 'Repayment Term', 'Your Finances', 'Review'][step - 1]}
          </span>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1.5">Loan Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <input
                type="number"
                value={form.amount_requested / 100}
                onChange={e => setForm(f => ({ ...f, amount_requested: Math.round(parseFloat(e.target.value) * 100) }))}
                min={1000}
                max={50000}
                step={100}
                className="w-full rounded-lg border bg-white pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Between $1,000 and $50,000</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Loan Purpose</label>
            <select
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {purposes.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              value={form.purpose_description}
              onChange={e => setForm(f => ({ ...f, purpose_description: e.target.value }))}
              rows={3}
              placeholder="Tell us more about how you'll use this loan..."
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-3">Repayment Term</label>
            <div className="grid grid-cols-4 gap-3">
              {SUPPORTED_TERMS.map(term => (
                <button
                  key={term}
                  onClick={() => setForm(f => ({ ...f, term_months: term }))}
                  className={`rounded-lg border p-3 text-center transition-colors ${form.term_months === term ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                >
                  <div className="font-semibold">{term}</div>
                  <div className="text-xs text-muted-foreground">months</div>
                </button>
              ))}
            </div>
          </div>

          {preview && (
            <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
              <h3 className="font-semibold">Estimated Payment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Payment</p>
                  <p className="text-2xl font-bold">{formatCents(preview.monthly_payment)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Interest Rate</p>
                  <p className="text-2xl font-bold">{formatPercent(preview.interest_rate)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Final rate depends on your credit assessment</p>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1.5">Employment Status</label>
            <select
              value={form.employment_status}
              onChange={e => setForm(f => ({ ...f, employment_status: e.target.value }))}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="employed">Employed</option>
              <option value="self_employed">Self-Employed</option>
              <option value="unemployed">Unemployed</option>
              <option value="retired">Retired</option>
              <option value="student">Student</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Annual Income</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <input
                type="number"
                value={form.annual_income / 100}
                onChange={e => setForm(f => ({ ...f, annual_income: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                min={0}
                step={1000}
                className="w-full rounded-lg border bg-white pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Monthly Expenses</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <input
                type="number"
                value={form.monthly_expenses / 100}
                onChange={e => setForm(f => ({ ...f, monthly_expenses: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                min={0}
                step={100}
                className="w-full rounded-lg border bg-white pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5 rounded-lg border p-6">
          <h3 className="font-semibold text-lg">Review Your Application</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-muted-foreground">Loan Amount</p><p className="font-medium">{formatCents(form.amount_requested)}</p></div>
            <div><p className="text-muted-foreground">Purpose</p><p className="font-medium">{LOAN_PURPOSE_LABELS[form.purpose] ?? form.purpose}</p></div>
            <div><p className="text-muted-foreground">Term</p><p className="font-medium">{form.term_months} months</p></div>
            {preview && <div><p className="text-muted-foreground">Est. Monthly Payment</p><p className="font-medium">{formatCents(preview.monthly_payment)}</p></div>}
            {preview && <div><p className="text-muted-foreground">Est. Total Repayment</p><p className="font-medium">{formatCents(preview.monthly_payment * form.term_months)}</p></div>}
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            By submitting, your application will go to our admin team for review. You'll receive a decision within 1–2 business days.
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {step > 1 && (
          <button
            onClick={() => setStep(s => (s - 1) as Step)}
            className="rounded-md border px-5 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Back
          </button>
        )}
        {step < 4 ? (
          <button
            onClick={() => setStep(s => (s + 1) as Step)}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
        )}
      </div>
    </div>
  )
}
