import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { formatCents, formatDate, formatPercent, getCurrencySymbol } from '@/lib/utils'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { LOAN_PURPOSE_LABELS, partialAdvanceSavings, quoteAdvance } from '@lendflow/shared'
import { ArrowLeft, TrendingUp, XCircle } from 'lucide-react'
import { QrImage } from '@/components/shared/QrImage'
import type { LoanScheduleItem } from '@lendflow/shared'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { expectedFullPayment, PaidInFullDialog } from './PaidInFullDialog'
import { BorrowerRequests } from './BorrowerRequests'

const CANCEL_REASONS = [
  'Borrower requested cancellation',
  'Unable to verify borrower',
  'Terms no longer suitable',
  'Funds no longer available',
  'Other',
]

const TERMINAL = ['completed', 'cancelled', 'rejected', 'defaulted']

interface CommitmentDetail {
  id: string
  loan_id: string
  amount: number
  share_percent: number
  expected_yield: number
  actual_yield: number
  status: string
  funded_at: string
  loans: {
    id: string
    purpose: string
    term_months: number
    repayment_type?: string
    interest_rate: number
    ai_credit_grade?: string
    admin_override_grade?: string
    ai_reasoning?: string
    status: string
    first_payment_date?: string
    maturity_date?: string
    amount_requested: number
    approved_amount: number
    monthly_payment: number
    total_repayment: number
    currency?: string
    borrower_id?: string
    verification_mode?: 'formal' | 'manual'
    payment_channel?: 'wallet' | 'instapay'
    loan_kind?: 'cash' | 'product'
    product_name?: string | null
    verification_note?: string
  }
}

interface YieldDistribution {
  id: string
  principal_return: number
  interest_return: number
  total_return: number
  distributed_at: string
}

export function CommitmentDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [showCancel, setShowCancel] = useState(false)
  const [partialAmount, setPartialAmount] = useState('')
  const [extendDate, setExtendDate] = useState('')
  const [confirmFull, setConfirmFull] = useState(false)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelOther, setCancelOther] = useState('')

  const { data: commitment, isLoading } = useQuery({
    queryKey: ['commitment', id],
    queryFn: async () => {
      const { data } = await api.get<{ commitment: CommitmentDetail }>(`/api/lender/commitments/${id}`)
      return data.commitment
    },
  })

  const loanId = commitment?.loans.id

  const { data: access } = useQuery({
    queryKey: ['loan-access', loanId],
    queryFn: async () => {
      const { data } = await api.get<{ access_token: string; payment_channel: string; verification_mode: string }>(`/api/lender/loans/${loanId}/access`)
      return data
    },
    enabled: !!loanId,
  })

  const { data: schedule } = useQuery({
    queryKey: ['lender-schedule', loanId],
    queryFn: async () => {
      const { data } = await api.get<{ schedule: LoanScheduleItem[] }>(`/api/loans/${loanId}/schedule`)
      return data.schedule
    },
    enabled: !!loanId && (commitment?.loans.payment_channel === 'instapay' || access?.payment_channel === 'instapay'),
  })

  const markPaid = useMutation({
    mutationFn: (body: { mode: 'partial' | 'full' | 'installment' | 'advance'; amount?: number; schedule_id?: string }) =>
      api.post(`/api/lender/loans/${loanId}/instapay-payment`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lender-schedule', loanId] })
      qc.invalidateQueries({ queryKey: ['commitment', id] })
      qc.invalidateQueries({ queryKey: ['commitment-yields', id] })
      qc.invalidateQueries({ queryKey: ['lender-commitments'] })
      setPartialAmount('')
      setConfirmFull(false)
      const saved = (res.data as { interest_saved?: number }).interest_saved ?? 0
      toast.success(saved > 0 ? 'Advance payment recorded. Interest was recalculated.' : 'Payment recorded')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not record the payment'
      toast.error(msg)
    },
  })

  const extendDue = useMutation({
    mutationFn: () => api.post(`/api/lender/loans/${loanId}/extend`, { due_date: extendDate }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lender-schedule', loanId] })
      qc.invalidateQueries({ queryKey: ['commitment', id] })
      qc.invalidateQueries({ queryKey: ['lender-commitments'] })
      setExtendDate('')
      toast.success('Due date extended. The amount due includes the extra interest.')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not extend the due date'
      toast.error(msg)
    },
  })

  const { data: yields } = useQuery({
    queryKey: ['commitment-yields', id],
    queryFn: async () => {
      const { data } = await api.get<{ yields: YieldDistribution[] }>(`/api/lender/commitments/${id}/yields`)
      return data.yields
    },
    enabled: !!commitment,
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const reason = cancelReason === 'Other' ? cancelOther.trim() : cancelReason
      await api.post(`/api/lender/commitments/${id}/cancel`, { reason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commitment', id] })
      qc.invalidateQueries({ queryKey: ['lender-commitments'] })
      setShowCancel(false)
      toast.success('Loan cancelled')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to cancel')
    },
  })

  if (isLoading) return (
    <div className="space-y-4">
      <CardSkeleton />
      <div className="grid grid-cols-2 gap-3">{Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}</div>
    </div>
  )

  if (!commitment) return (
    <div className="text-center py-16 text-muted-foreground">Commitment not found</div>
  )

  const loan = commitment.loans
  const cur = loan.currency
  const fmt = (cents: number): string => formatCents(cents, cur)
  const loanSymbol = getCurrencySymbol(cur ?? 'USD')
  const grade = loan.admin_override_grade ?? loan.ai_credit_grade
  const yieldProgress = commitment.expected_yield > 0
    ? (commitment.actual_yield / commitment.expected_yield) * 100
    : 0

  const monthlyYields = (yields ?? []).reduce<Record<string, { month: string; interest: number; principal: number }>>((acc, y) => {
    const month = y.distributed_at.slice(0, 7)
    if (!acc[month]) acc[month] = { month, interest: 0, principal: 0 }
    acc[month].interest += y.interest_return
    acc[month].principal += y.principal_return
    return acc
  }, {})
  const chartData = Object.values(monthlyYields)
  const fullQuote = expectedFullPayment(schedule ?? [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <Link to="/lender" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Portfolio
      </Link>
      <BorrowerRequests loanId={loan.id} />

      {/* Header card */}
      <div className="card-base p-4 md:p-6 space-y-4">

        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">{loan.loan_kind === 'product' && loan.product_name ? loan.product_name : (LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose)}</h1>
              <CreditGradeBadge grade={grade} />
            </div>
            <p className="text-xs text-muted-foreground">
              Funded {formatDate(commitment.funded_at)} · {loan.repayment_type === 'dated' ? `${schedule?.length ?? loan.term_months} dates` : `${loan.term_months}mo`} · {loan.repayment_type === 'dated' && !loan.interest_rate ? 'No interest' : formatPercent(loan.interest_rate)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold">{fmt(commitment.amount)}</p>
            <p className="text-xs text-muted-foreground">{commitment.share_percent.toFixed(2)}% share</p>
          </div>
        </div>

        {/* KPI grid — 2 cols on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Committed', value: fmt(commitment.amount), color: '' },
            { label: 'Yield Earned', value: fmt(commitment.actual_yield), color: 'text-primary' },
            { label: 'Expected Yield', value: fmt(commitment.expected_yield), color: '' },
            {
              label: 'Status',
              value: commitment.status.replace('_', ' '),
              color: commitment.status === 'non_performing' ? 'text-destructive'
                : commitment.status === 'completed' ? 'text-emerald-600' : 'text-primary',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className={`text-sm font-bold mt-0.5 capitalize truncate ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Yield progress */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Yield progress</span>
            <span>{yieldProgress.toFixed(0)}% of expected</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, yieldProgress)}%` }} />
          </div>
        </div>

        {/* Cancel button */}
        {!TERMINAL.includes(loan.status) && !showCancel && (
          <button
            onClick={() => setShowCancel(true)}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel Loan
          </button>
        )}

        {/* Cancel form */}
        {showCancel && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div>
              <p className="font-semibold text-destructive text-sm">Cancel this loan</p>
              <p className="text-xs text-muted-foreground mt-0.5">Please provide a reason.</p>
            </div>
            <select
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {cancelReason === 'Other' && (
              <textarea
                value={cancelOther}
                onChange={e => setCancelOther(e.target.value)}
                rows={2}
                placeholder="Describe your reason…"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive resize-none"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending || (cancelReason === 'Other' && !cancelOther.trim())}
                className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowCancel(false); setCancelReason(CANCEL_REASONS[0]); setCancelOther('') }}
                className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                Keep Loan
              </button>
            </div>
          </div>
        )}
      </div>

      {access?.access_token && (
        <section className="card-base p-4 space-y-3">
          <h2 className="font-semibold text-sm">Share with the borrower</h2>
          <p className="text-xs text-muted-foreground">
            {loan.verification_mode === 'manual'
              ? 'Documents are waived. You verified this person yourself.'
              : 'Send this link or QR so they can open the loan on their phone.'}
            {loan.payment_channel === 'instapay' ? ' Payments stay on your InstaPay QR. Record them here when the money arrives.' : ''}
          </p>
          <QrImage value={`${window.location.origin}/track/${access.access_token}`} caption="Borrower access QR" />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/track/${access.access_token}`).then(() => toast.success('Link copied'))}
            className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
          >
            Copy link
          </button>
        </section>
      )}

      {loan.payment_channel === 'instapay' && !!schedule?.length && (
        <section className="card-base p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-sm">{loan.loan_kind === 'product' ? 'Product payments' : 'Payments'}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remaining {fmt(schedule.reduce((sum, row) => sum + Math.max(0, row.total_due - row.total_paid), 0))}
              </p>
            </div>
            <button
              type="button"
              disabled={markPaid.isPending || schedule.every(row => row.status === 'paid' || row.status === 'waived')}
              onClick={() => setConfirmFull(true)}
              className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Paid in full
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              min="1"
              value={partialAmount}
              onChange={e => setPartialAmount(e.target.value)}
              placeholder="Partial amount"
              className="min-h-11 flex-1 rounded-lg border bg-background px-3 text-sm"
            />
            <button
              type="button"
              disabled={markPaid.isPending || !(Number(partialAmount) > 0)}
              onClick={() => markPaid.mutate({ mode: 'partial', amount: Math.round(Number(partialAmount) * 100) })}
              className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Record partial
            </button>
          </div>
          {(() => {
            const advance = quoteAdvance(schedule, loan.interest_rate ?? 0)
            if (!advance || advance.days_early <= 0 || advance.interest_saved <= 0) return null
            const typed = Math.round(Number(partialAmount) * 100)
            const partialSaved = typed > 0 ? partialAdvanceSavings(schedule, loan.interest_rate ?? 0, typed) : 0
            return (
              <div className="space-y-2 rounded-lg bg-muted/60 px-3 py-3">
                <p className="text-sm font-medium">Advance payment</p>
                <p className="text-xs text-muted-foreground">
                  Paying the rest today, {advance.days_early} days early, removes {fmt(advance.interest_saved)}. The amount due becomes {fmt(advance.payoff_amount)} instead of {fmt(advance.scheduled_amount)}.
                </p>
                {partialSaved > 0 && (
                  <p className="text-xs">This partial payment removes {fmt(partialSaved)} of interest.</p>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate({ mode: 'advance' })}
                    className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    Record early payoff
                  </button>
                  <button
                    type="button"
                    disabled={markPaid.isPending || partialSaved <= 0}
                    onClick={() => markPaid.mutate({ mode: 'advance', amount: typed })}
                    className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Record advance partial
                  </button>
                </div>
              </div>
            )
          })()}
          {(() => {
            const openRows = schedule.filter(row => row.status !== 'paid' && row.status !== 'waived')
            const last = openRows[openRows.length - 1]
            if (!last) return null
            const extraDays = extendDate
              ? Math.round((Date.parse(`${extendDate}T00:00:00`) - Date.parse(`${last.due_date}T00:00:00`)) / 86400000)
              : 0
            const principal = openRows.reduce((sum, row) => sum + Math.max(0, row.principal_due - row.principal_paid), 0)
            const extra = extraDays > 0 ? Math.round(principal * (loan.interest_rate ?? 0) * extraDays / 365) : 0
            const stillOwed = openRows.reduce((sum, row) => sum + Math.max(0, row.total_due - row.total_paid), 0)
            return (
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Extend the full-payment date</p>
                <p className="text-xs text-muted-foreground">Current full payment is due {formatDate(last.due_date)}. Extra days add interest on the remaining principal.</p>
                <input
                  type="date"
                  value={extendDate}
                  min={last.due_date}
                  onChange={e => setExtendDate(e.target.value)}
                  className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
                />
                {extraDays > 0 && (
                  <p className="text-xs">
                    {extraDays} more days adds {fmt(extra)}. New amount due {fmt(stillOwed + extra)}.
                  </p>
                )}
                <button
                  type="button"
                  disabled={extendDue.isPending || extraDays <= 0}
                  onClick={() => extendDue.mutate()}
                  className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {extendDue.isPending ? 'Updating…' : 'Extend due date'}
                </button>
              </div>
            )
          })()}
          {schedule.map(row => {
            const owed = Math.max(0, row.total_due - row.total_paid)
            return (
              <div key={row.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0 text-sm">
                <div>
                  <p>#{row.installment_number} · {formatDate(row.due_date)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{row.status}{row.total_paid > 0 ? ` · ${fmt(row.total_paid)} received` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{fmt(owed > 0 ? owed : row.total_due)}</span>
                  {owed > 0 && (
                    <button
                      type="button"
                      disabled={markPaid.isPending}
                      onClick={() => markPaid.mutate({ mode: 'installment', schedule_id: row.id })}
                      className="min-h-11 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      This one
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <PaidInFullDialog
            open={confirmFull}
            currency={loan.currency}
            expected={fullQuote.expected}
            principal={fullQuote.principal}
            interest={fullQuote.interest}
            pending={markPaid.isPending}
            onCancel={() => setConfirmFull(false)}
            onConfirm={() => markPaid.mutate({ mode: 'full' })}
          />
        </section>
      )}

      {/* Loan terms + credit — stack on mobile, side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-base p-4">
          <h2 className="font-semibold mb-3 text-sm">Loan Terms</h2>
          <div className="space-y-2.5">
            {[
              { label: 'Loan Amount', value: fmt(loan.approved_amount) },
              loan.repayment_type === 'dated'
                ? { label: 'Payments', value: `${schedule?.length ?? 0} specific dates` }
                : { label: 'Monthly Payment', value: fmt(loan.monthly_payment) },
              { label: 'Total Repayment', value: fmt(loan.total_repayment) },
              { label: 'First Payment', value: loan.first_payment_date ? formatDate(loan.first_payment_date) : '—' },
              { label: 'Maturity', value: loan.maturity_date ? formatDate(loan.maturity_date) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium text-right">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {loan.ai_reasoning && (
          <div className="card-base p-4">
            <h2 className="font-semibold mb-3 text-sm">Credit Assessment</h2>
            <CreditGradeBadge grade={grade} />
            <p className="text-xs text-muted-foreground leading-relaxed mt-2 line-clamp-5">{loan.ai_reasoning}</p>
          </div>
        )}
      </div>

      {/* Yield chart */}
      {chartData.length > 0 && (
        <div className="card-base p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Monthly Yield Received</h2>
          </div>
          <div className="h-40 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(138 12% 91%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${loanSymbol}${(v / 100).toFixed(0)}`} tick={{ fontSize: 10, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v: unknown) => fmt(v as number)} />
              <Bar dataKey="interest" name="Interest" fill="hsl(142 52% 38%)" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="principal" name="Principal" fill="hsl(142 52% 70%)" radius={[3, 3, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Distribution history */}
      <div>
        <h2 className="font-semibold mb-3 text-sm">Distribution History</h2>
        {!yields?.length ? (
          <div className="card-base p-8 text-center text-sm text-muted-foreground">
            No distributions yet — payments will appear here as the borrower repays.
          </div>
        ) : (
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Principal</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Interest</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {yields.map(y => (
                    <tr key={y.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                      <td className="p-3 text-xs text-muted-foreground">{formatDate(y.distributed_at)}</td>
                      <td className="p-3 text-right font-mono text-xs">{fmt(y.principal_return)}</td>
                      <td className="p-3 text-right font-mono text-xs text-primary">{fmt(y.interest_return)}</td>
                      <td className="p-3 text-right font-mono text-xs font-medium">{fmt(y.total_return)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
