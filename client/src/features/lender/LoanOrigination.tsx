import { useState, useMemo, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { CheckCircle2, Upload, X, ArrowRight, ArrowLeft } from 'lucide-react'

const PURPOSES = Object.entries(LOAN_PURPOSE_LABELS)

type PaymentType = 'lump_sum' | 'installments'
type RatePeriod = 'per_15_days' | 'per_30_days' | 'monthly' | 'annually' | 'flat'
type Step = 1 | 2 | 3 | 4

interface Form {
  borrower_name: string
  borrower_email: string
  borrower_phone: string
  purpose: string
  notes: string
  amount: number
  interest_rate: number
  rate_period: RatePeriod
  payment_type: PaymentType
  due_date: string
  term_months: number
}

const INITIAL: Form = {
  borrower_name: '',
  borrower_email: '',
  borrower_phone: '',
  purpose: 'personal',
  notes: '',
  amount: 1000000,
  interest_rate: 5,
  rate_period: 'monthly',
  payment_type: 'installments',
  due_date: '',
  term_months: 12,
}

const RATE_OPTIONS: { value: RatePeriod; label: string; desc: string }[] = [
  { value: 'per_15_days', label: 'Per 15 days',  desc: 'Rate applies every 15-day period' },
  { value: 'per_30_days', label: 'Per 30 days',  desc: 'Rate applies every 30-day period' },
  { value: 'monthly',     label: 'Monthly',       desc: 'Rate applies each calendar month' },
  { value: 'annually',    label: 'Annually',      desc: 'Standard annual rate (APR)' },
  { value: 'flat',        label: 'Flat total',    desc: 'One-time % of principal, any duration' },
]

function monthsBetween(a: Date, b: Date) {
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()))
}

function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000))
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium mb-1.5">{children}</label>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary placeholder:text-muted-foreground/60"
    />
  )
}

export function LoanOrigination() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<Form>(INITIAL)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  // Calculated amounts
  const term = useMemo(() => {
    if (form.payment_type === 'lump_sum' && form.due_date) {
      return monthsBetween(new Date(), new Date(form.due_date))
    }
    return form.term_months
  }, [form.payment_type, form.due_date, form.term_months])

  const durationDays = useMemo(() => {
    if (form.payment_type === 'lump_sum' && form.due_date) {
      return daysBetween(new Date(), new Date(form.due_date))
    }
    return form.term_months * 30
  }, [form.payment_type, form.due_date, form.term_months])

  const calc = useMemo(() => {
    const p = form.amount
    const r = form.interest_rate / 100

    let totalInt = 0

    switch (form.rate_period) {
      case 'per_15_days': {
        const periods = Math.max(1, Math.round(durationDays / 15))
        totalInt = Math.round(p * r * periods)
        break
      }
      case 'per_30_days': {
        const periods = Math.max(1, Math.round(durationDays / 30))
        totalInt = Math.round(p * r * periods)
        break
      }
      case 'monthly': {
        totalInt = Math.round(p * r * term)
        break
      }
      case 'annually': {
        // Standard amortizing APR for installments, simple for lump sum
        if (form.payment_type === 'installments' && term > 0) {
          const rm = r / 12
          const monthly = rm === 0 ? Math.round(p / term)
            : Math.round((p * (rm * Math.pow(1 + rm, term))) / (Math.pow(1 + rm, term) - 1))
          totalInt = monthly * term - p
        } else {
          totalInt = Math.round(p * r * (durationDays / 365))
        }
        break
      }
      case 'flat':
      default:
        totalInt = Math.round(p * r)
        break
    }

    const totalRep = p + totalInt

    if (form.payment_type === 'lump_sum') {
      return { monthlyPayment: totalRep, totalRepayment: totalRep, totalInterest: totalInt }
    }

    const monthly = term > 0 ? Math.round(totalRep / term) : 0
    return { monthlyPayment: monthly, totalRepayment: monthly * term, totalInterest: monthly * term - p }
  }, [form.amount, form.interest_rate, form.rate_period, form.payment_type, term, durationDays])

  const { monthlyPayment, totalRepayment, totalInterest } = calc

  // Annual rate equivalent for server storage
  const annualRate = useMemo(() => {
    const r = form.interest_rate / 100
    if (form.rate_period === 'flat') return durationDays > 0 ? r / (durationDays / 365) : r
    if (form.rate_period === 'per_15_days') return r * (365 / 15)
    if (form.rate_period === 'per_30_days') return r * (365 / 30)
    if (form.rate_period === 'monthly') return r * 12
    return r // annually
  }, [form.interest_rate, form.rate_period, durationDays])

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/lender/loans/new', {
        borrower_name: form.borrower_name,
        borrower_email: form.borrower_email || undefined,
        borrower_phone: form.borrower_phone || undefined,
        purpose: form.purpose,
        notes: form.notes || undefined,
        amount_requested: form.amount,
        interest_rate: annualRate,
        monthly_payment: monthlyPayment,
        total_repayment: totalRepayment,
        payment_type: form.payment_type,
        due_date: form.payment_type === 'lump_sum' ? form.due_date : undefined,
        term_months: form.payment_type === 'installments' ? form.term_months : undefined,
      })
      return data
    },
    onSuccess: () => setDone(true),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Something went wrong'
      toast.error(msg)
    },
  })

  function handleReceipt(file: File) {
    setReceipt(file)
    const reader = new FileReader()
    reader.onload = e => setReceiptPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const minDate = new Date()
  minDate.setMonth(minDate.getMonth() + 1)

  // Step validity
  const step1Valid = form.borrower_name.trim().length > 0
  const step2Valid = form.amount > 0 && form.interest_rate > 0 &&
    (form.payment_type === 'installments' ? form.term_months > 0 : !!form.due_date)

  const STEPS = ['Borrower', 'Terms', 'Review', 'Finalise']

  if (done) {
    return (
      <div className="max-w-md mx-auto pt-16 text-center space-y-5">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold">Loan recorded</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {formatCents(form.amount)} · {form.interest_rate}% p.a. · {form.payment_type === 'lump_sum' ? `Due ${form.due_date}` : `${form.term_months} months`}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {form.borrower_name}'s repayment schedule is now active.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/lender')} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
            Go to Portfolio
          </button>
          <button onClick={() => { setDone(false); setStep(1); setForm(INITIAL); setReceipt(null); setReceiptPreview(null) }} className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted">
            New Loan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step
          const active = n === step
          const done = n < step
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done ? 'bg-primary text-white' : active ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'
                }`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                <span className={`text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mb-4 mx-1 ${n < step ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Borrower ─────────────────────────────────── */}
      {step === 1 && (
        <div className="card-base p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Who's borrowing?</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Contact info is optional — this is for your records only.</p>
          </div>
          <div>
            <Label>Full name <span className="text-destructive">*</span></Label>
            <Input
              autoFocus
              value={form.borrower_name}
              onChange={e => set('borrower_name', e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <Label>Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="email"
              value={form.borrower_email}
              onChange={e => set('borrower_email', e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <Label>Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="tel"
              value={form.borrower_phone}
              onChange={e => set('borrower_phone', e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>
        </div>
      )}

      {/* ── Step 2: Terms ────────────────────────────────────── */}
      {step === 2 && (
        <div className="card-base p-6 space-y-5">
          <h2 className="font-semibold">Loan terms</h2>

          <div>
            <Label>Amount <span className="text-destructive">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <input
                type="number"
                value={form.amount / 100}
                onChange={e => set('amount', Math.round(parseFloat(e.target.value || '0') * 100))}
                min={100}
                step={100}
                placeholder="10,000"
                className="w-full rounded-lg border bg-white pl-7 pr-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          <div>
            <Label>Repayment type <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: 'installments' as PaymentType, label: 'Monthly installments', desc: 'Fixed payments each month' },
                { v: 'lump_sum' as PaymentType, label: 'Single repayment', desc: 'Full amount on a due date' },
              ]).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => set('payment_type', opt.v)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    form.payment_type === opt.v ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Interest rate <span className="text-destructive">*</span></Label>
            <div className="relative">
              <input
                type="number"
                value={form.interest_rate}
                onChange={e => set('interest_rate', parseFloat(e.target.value || '0'))}
                min={0}
                step={0.5}
                className="w-full rounded-lg border bg-white pl-3 pr-8 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">%</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {RATE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('rate_period', opt.value)}
                  title={opt.desc}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                    form.rate_period === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {RATE_OPTIONS.find(o => o.value === form.rate_period)?.desc}
            </p>
          </div>

          {form.payment_type === 'installments' && (
            <div>
              <Label>Number of months <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={form.term_months}
                onChange={e => set('term_months', parseInt(e.target.value || '1'))}
                min={1}
                max={360}
                placeholder="12"
              />
            </div>
          )}

          {form.payment_type === 'lump_sum' && (
            <div>
              <Label>Due date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.due_date}
                min={minDate.toISOString().split('T')[0]}
                onChange={e => set('due_date', e.target.value)}
              />
              {form.due_date && (
                <p className="text-xs text-muted-foreground mt-1">{term} month{term !== 1 ? 's' : ''} from today</p>
              )}
            </div>
          )}

          <div>
            <Label>Purpose</Label>
            <select
              value={form.purpose}
              onChange={e => set('purpose', e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Any context about this loan…"
              className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Review ───────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card-base p-6 space-y-4">
            <h2 className="font-semibold">Review</h2>

            <div className="space-y-2.5">
              {[
                { label: 'Borrower', value: form.borrower_name },
                form.borrower_email ? { label: 'Email', value: form.borrower_email } : null,
                form.borrower_phone ? { label: 'Phone', value: form.borrower_phone } : null,
                { label: 'Amount', value: formatCents(form.amount) },
                { label: 'Interest rate', value: `${form.interest_rate}% ${RATE_OPTIONS.find(o => o.value === form.rate_period)?.label.toLowerCase()}` },
                {
                  label: form.payment_type === 'lump_sum' ? 'Repayment' : 'Monthly payment',
                  value: form.payment_type === 'lump_sum'
                    ? `${formatCents(totalRepayment)} on ${form.due_date}`
                    : `${formatCents(monthlyPayment)} × ${form.term_months} months`,
                  accent: true,
                },
                { label: 'Total repayment', value: formatCents(totalRepayment) },
                { label: 'Total interest', value: formatCents(totalInterest) },
                { label: 'Purpose', value: LOAN_PURPOSE_LABELS[form.purpose] ?? form.purpose },
              ].filter(Boolean).map((row) => {
                const r = row!
                return (
                  <div key={r.label} className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{r.label}</p>
                    <p className={`text-sm font-semibold ${r.accent ? 'text-primary' : ''}`}>{r.value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Send the funds now</p>
            <p className="text-sm text-amber-800 mt-1">
              Transfer <span className="font-bold">{formatCents(form.amount)}</span> to{' '}
              <span className="font-bold">{form.borrower_name}</span> before continuing.
              Once you've sent the money, click Continue to upload the receipt.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 4: Finalise ─────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card-base p-6 space-y-4">
            <h2 className="font-semibold">Upload transfer receipt</h2>
            <p className="text-sm text-muted-foreground">
              Attach a screenshot or photo of the transfer confirmation.
            </p>

            {!receipt ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-border py-10 text-center hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Click to upload</p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG or PDF</p>
              </button>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-border">
                {receiptPreview && receiptPreview.startsWith('data:image') ? (
                  <img src={receiptPreview} alt="Receipt" className="w-full max-h-56 object-contain bg-muted/20" />
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-muted/20">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{receipt.name}</p>
                      <p className="text-xs text-muted-foreground">{(receipt.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { setReceipt(null); setReceiptPreview(null) }}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleReceipt(f) }}
            />
          </div>

          <button
            onClick={() => create.mutate()}
            disabled={!receipt || create.isPending}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-colors"
          >
            {create.isPending ? 'Saving…' : 'Finalise Loan'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        {step > 1 ? (
          <button
            onClick={() => setStep(s => (s - 1) as Step)}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        ) : <div />}

        {step < 4 && (
          <button
            onClick={() => setStep(s => (s + 1) as Step)}
            disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : false}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {step === 3 ? 'Funds Sent →' : 'Continue'} {step !== 3 && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}
