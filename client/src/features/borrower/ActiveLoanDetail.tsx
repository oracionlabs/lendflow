import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate, formatPercent, useCurrencySymbol } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import type { Loan, LoanScheduleItem } from '@lendflow/shared'
import { quoteAdvance, quoteAsOfToday } from '@lendflow/shared'
import { loanTitle } from '@/lib/loan-label'
import { CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react'

const CANCEL_REASONS = [
  'No longer need the funds',
  'Found alternative financing',
  'Terms not suitable',
  'Taking too long',
  'Other',
]

const CANCELLABLE = ['draft', 'submitted', 'under_review', 'approved', 'funding', 'fully_funded']

function ScheduleStatusIcon({ status }: { status: string }) {
  if (status === 'paid') return <CheckCircle className="h-4 w-4 text-green-600" />
  if (status === 'late' || status === 'missed') return <AlertCircle className="h-4 w-4 text-red-600" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

export function ActiveLoanDetail() {
  const symbol = useCurrencySymbol()
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [payAmount, setPayAmount] = useState<number | null>(null)
  const [payMode, setPayMode] = useState<'installment' | 'custom' | 'payoff'>('installment')
  const [paying, setPaying] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelOther, setCancelOther] = useState('')
  const [extendDate, setExtendDate] = useState('')
  const [showExtend, setShowExtend] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [showPayFull, setShowPayFull] = useState(false)

  const { data: loanPayload, isLoading: loanLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: async () => {
      const { data } = await api.get<{ loan: Loan; instapay_qr?: string | null }>(`/api/loans/${id}`)
      return data
    },
  })
  const loanData = loanPayload?.loan
  const instapayQr = loanPayload?.instapay_qr

  const { data: schedule, isLoading: schedLoading } = useQuery({
    queryKey: ['loan-schedule', id],
    queryFn: async () => {
      const { data } = await api.get<{ schedule: LoanScheduleItem[] }>(`/api/loans/${id}/schedule`)
      return data.schedule
    },
  })

  const { data: payoffData } = useQuery({
    queryKey: ['payoff-quote', id],
    queryFn: async () => {
      const { data } = await api.get<{ payoff_amount: number; interest_saved: number }>(`/api/loans/${id}/payoff-quote`)
      return data
    },
    enabled: !!loanData && ['active', 'repaying'].includes(loanData.status),
  })

  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const { data } = await api.get<{ wallet: { available_balance: number } }>('/api/wallet')
      return data.wallet
    },
  })

  const nextDue = schedule?.find(s => !['paid', 'waived'].includes(s.status))

  const totalPaid = schedule?.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.total_paid, 0) ?? 0
  const totalDue = schedule?.reduce((sum, s) => sum + s.total_due, 0) ?? 0
  const progressPct = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0

  const handlePayment = async () => {
    if (!nextDue) return
    setPaying(true)
    try {
      const amount = payMode === 'payoff'
        ? (payoffData?.payoff_amount ?? 0)
        : payMode === 'custom'
          ? (payAmount ?? 0)
          : nextDue.total_due + nextDue.late_fee

      await api.post(`/api/loans/${id}/payments`, { schedule_id: nextDue.id, amount, advance: payMode === 'payoff' })
      qc.invalidateQueries({ queryKey: ['loan-schedule', id] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['payoff-quote', id] })
      toast.success('Payment successful!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Payment failed'
      toast.error(msg)
    } finally {
      setPaying(false)
    }
  }

  const { data: asks } = useQuery({
    queryKey: ['loan-requests', id],
    queryFn: async () => {
      const { data } = await api.get<{ requests: Array<{ id: string; kind: 'extension' | 'interest_only' | 'pay_in_full'; requested_due_date: string | null; amount: number | null; status: string }> }>(`/api/loans/${id}/requests`)
      return data.requests ?? []
    },
    enabled: !!loanData && ['active', 'repaying'].includes(loanData.status),
  })

  const ask = useMutation({
    mutationFn: (body: { kind: 'extension' | 'interest_only' | 'pay_in_full'; due_date?: string }) =>
      api.post(`/api/loans/${id}/requests`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan-requests', id] })
      setExtendDate('')
      setShowExtend(false)
      setShowPay(false)
      setShowPayFull(false)
      toast.success('Sent to your lender')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not send that')
    },
  })

  const payInterest = useMutation({
    mutationFn: () => api.post(`/api/loans/${id}/payments`, { interest_only: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan-schedule', id] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      setShowPay(false)
      toast.success('Interest paid. The principal stays on the schedule.')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Payment failed')
    },
  })

  const payFull = useMutation({
    mutationFn: () => api.post(`/api/loans/${id}/payments`, { pay_in_full: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', id] })
      qc.invalidateQueries({ queryKey: ['loan-schedule', id] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      setShowPayFull(false)
      toast.success('Paid in full.')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Payment failed')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const reason = cancelReason === 'Other' ? cancelOther.trim() : cancelReason
      await api.post(`/api/loans/${id}/cancel`, { reason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', id] })
      qc.invalidateQueries({ queryKey: ['borrower-loans'] })
      setShowCancel(false)
      toast.success('Loan cancelled')
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to cancel')
    },
  })

  if (loanLoading) return <TableSkeleton />

  const loan = loanData!
  const fmt = (cents: number): string => formatCents(cents, loan.currency)

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-heading break-words">{loanTitle(loan)}</h1>
          <p className="text-sm text-muted-foreground">
            {[
              loan.loan_kind === 'product' ? 'Product' : 'Cash',
              loan.interest_rate && loan.interest_rate > 0 ? formatPercent(loan.interest_rate) : null,
              loan.maturity_date ? `due ${formatDate(loan.maturity_date)}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <StatusBadge status={loan.status} />
            <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
          </div>
        </div>
        <div className="sm:text-right space-y-2">
          <p className="text-2xl sm:text-3xl font-bold break-words">{fmt(loan.approved_amount ?? 0)}</p>
          <p className="text-sm text-muted-foreground">
            {loan.repayment_type === 'dated'
              ? `${schedule?.length ?? loan.term_months} payments on specific dates`
              : `${loan.term_months} month term`}
          </p>
          {CANCELLABLE.includes(loan.status) && !showCancel && (
            <button
              onClick={() => setShowCancel(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors sm:ml-auto"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel Loan
            </button>
          )}
        </div>
      </div>

      {showCancel && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <div>
            <p className="font-semibold text-destructive">Cancel this loan</p>
            <p className="text-xs text-muted-foreground mt-0.5">Please tell us why you're cancelling.</p>
          </div>
          <div className="space-y-3">
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
                placeholder="Please describe your reason…"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive resize-none"
              />
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || (cancelReason === 'Other' && !cancelOther.trim())}
              className="min-h-11 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
            <button
              onClick={() => { setShowCancel(false); setCancelReason(CANCEL_REASONS[0]); setCancelOther('') }}
              className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors"
            >
              Keep Loan
            </button>
          </div>
        </div>
      )}

      {['active', 'repaying', 'completed'].includes(loan.status) && (
        <>
          {nextDue && loan.status !== 'completed' && (() => {
            const open = (schedule ?? []).filter(row => !['paid', 'waived'].includes(row.status))
            const today = quoteAsOfToday(open, loan.interest_rate ?? 0)
            const interestLeft = today?.interest_today ?? 0
            const principalLeft = today?.principal ?? open.reduce((sum, row) => sum + Math.max(0, row.principal_due - row.principal_paid), 0)
            const last = open[open.length - 1]
            const pendingExtension = asks?.find(row => row.kind === 'extension' && row.status === 'pending')
            const pendingInterest = asks?.find(row => row.kind === 'interest_only' && row.status === 'pending')
            const pendingFull = asks?.find(row => row.kind === 'pay_in_full' && row.status === 'pending')
            const fullAmount = today?.payment_today ?? 0
            const extraDays = extendDate && last
              ? Math.round((Date.parse(`${extendDate}T00:00:00Z`) - Date.parse(`${last.due_date}T00:00:00Z`)) / 86400000)
              : 0
            const extra = extraDays > 0 ? Math.round(principalLeft * (loan.interest_rate ?? 0) * extraDays / 365) : 0
            const instapay = loan.payment_channel === 'instapay'
            return (
              <>
                <div className="card-base p-5 space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {pendingExtension ? (
                      <p className="text-sm">Waiting for your lender to confirm {pendingExtension.requested_due_date ? formatDate(pendingExtension.requested_due_date) : 'the new date'}.</p>
                    ) : (
                      <button type="button" onClick={() => setShowExtend(true)} className="min-h-11 rounded-lg border px-4 text-sm font-medium">
                        Request extension
                      </button>
                    )}
                    {interestLeft > 0 && (instapay && pendingInterest ? (
                      <p className="text-sm">Waiting for your lender to record {fmt(pendingInterest.amount ?? interestLeft)}.</p>
                    ) : (
                      <button type="button" onClick={() => setShowPay(true)} className="button-primary px-4">
                        Pay Now - {fmt(interestLeft)} only
                      </button>
                    ))}
                    {fullAmount > 0 && (instapay && pendingFull ? (
                      <p className="text-sm">Waiting for your lender to record the full payment of {fmt(pendingFull.amount ?? fullAmount)}.</p>
                    ) : (
                      <button type="button" onClick={() => setShowPayFull(true)} className="min-h-11 rounded-lg border px-4 text-sm font-medium">
                        Pay in full - {fmt(fullAmount)}
                      </button>
                    ))}
                  </div>
                  {today && (
                    <p className="text-sm text-muted-foreground">
                      If paid today, interest {fmt(today.interest_today)} and the full payment is {fmt(today.payment_today)}.
                      {today.days_from_due > 0
                        ? ` ${today.days_from_due} days past ${formatDate(today.due_date)}.`
                        : today.days_from_due < 0
                          ? ` That is ${fmt(today.scheduled_payment - today.payment_today)} less than the ${fmt(today.scheduled_payment)} due ${formatDate(today.due_date)}.`
                          : ' Today is the due date.'}
                    </p>
                  )}
                </div>
                {showExtend && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B2233]/40 p-4 sm:items-center" role="presentation" onClick={() => setShowExtend(false)}>
                    <div role="dialog" aria-modal="true" aria-labelledby="extend-title" className="w-full max-w-sm border border-border bg-card p-6" onClick={event => event.stopPropagation()}>
                      <h2 id="extend-title" className="font-serif text-[27px] leading-tight tracking-tight">Request an extension</h2>
                      <p className="mt-2 text-[13.5px] text-muted-foreground">
                        The principal stays. Extra days add interest, and your lender confirms the new date.
                        {last ? ` The current full payment is due ${formatDate(last.due_date)}.` : ''}
                      </p>
                      <label className="caps mt-6 block" htmlFor="extend-date">New due date</label>
                      <input
                        id="extend-date"
                        type="date"
                        value={extendDate}
                        min={last?.due_date}
                        onChange={e => setExtendDate(e.target.value)}
                        className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"
                      />
                      {extraDays > 0 && (
                        <p className="mt-3 text-sm">{extraDays} more days adds {fmt(extra)} of interest.</p>
                      )}
                      <div className="mt-6 flex items-center gap-4">
                        <button type="button" onClick={() => setShowExtend(false)} className="min-h-12 px-1.5 text-sm font-semibold">Cancel</button>
                        <button
                          type="button"
                          disabled={ask.isPending || extraDays <= 0}
                          onClick={() => ask.mutate({ kind: 'extension', due_date: extendDate })}
                          className="button-primary flex-1"
                        >
                          {ask.isPending ? 'Sending…' : 'Request extension'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {showPayFull && fullAmount > 0 && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B2233]/40 p-4 sm:items-center" role="presentation" onClick={() => setShowPayFull(false)}>
                    <div role="dialog" aria-modal="true" aria-labelledby="pay-full-title" className="w-full max-w-sm border border-border bg-card p-6" onClick={event => event.stopPropagation()}>
                      <h2 id="pay-full-title" className="font-serif text-[27px] leading-tight tracking-tight">Pay in full</h2>
                      <p className="caps mt-6">Payment if today</p>
                      <p className="num mt-2 text-[44px] leading-none">{fmt(fullAmount)}</p>
                      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
                        <div>
                          <dt className="text-xs text-muted-foreground">Principal</dt>
                          <dd className="num mt-1 text-xl">{fmt(principalLeft)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Interest</dt>
                          <dd className="num mt-1 text-xl">{fmt(interestLeft)}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-[13.5px] text-muted-foreground">
                        This closes the loan at the amount calculated through today.
                        {instapay ? ' Your lender records it when the money arrives.' : ''}
                      </p>
                      <div className="mt-6 flex items-center gap-4">
                        <button type="button" onClick={() => setShowPayFull(false)} className="min-h-12 px-1.5 text-sm font-semibold">Cancel</button>
                        <button
                          type="button"
                          disabled={instapay ? ask.isPending : payFull.isPending || (!instapay && (walletData?.available_balance ?? 0) < fullAmount)}
                          onClick={() => instapay ? ask.mutate({ kind: 'pay_in_full' }) : payFull.mutate()}
                          className="button-primary flex-1"
                        >
                          {(instapay ? ask.isPending : payFull.isPending) ? 'Sending…' : `Pay in full - ${fmt(fullAmount)}`}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {showPay && interestLeft > 0 && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B2233]/40 p-4 sm:items-center" role="presentation" onClick={() => setShowPay(false)}>
                    <div role="dialog" aria-modal="true" aria-labelledby="pay-now-title" className="w-full max-w-sm border border-border bg-card p-6" onClick={event => event.stopPropagation()}>
                      <h2 id="pay-now-title" className="font-serif text-[27px] leading-tight tracking-tight">Pay now</h2>
                      <p className="caps mt-6">Interest only</p>
                      <p className="num mt-2 text-[44px] leading-none">{fmt(interestLeft)}</p>
                      <p className="mt-3 text-[13.5px] text-muted-foreground">
                        This pays the interest through today. The principal of {fmt(principalLeft)} stays due {formatDate(nextDue.due_date)}.
                        {instapay ? ' Your lender records it when the money arrives.' : ''}
                      </p>
                      <div className="mt-6 flex items-center gap-4">
                        <button type="button" onClick={() => setShowPay(false)} className="min-h-12 px-1.5 text-sm font-semibold">Cancel</button>
                        <button
                          type="button"
                          disabled={instapay ? ask.isPending : payInterest.isPending || (!instapay && (walletData?.available_balance ?? 0) < interestLeft)}
                          onClick={() => instapay ? ask.mutate({ kind: 'interest_only' }) : payInterest.mutate()}
                          className="button-primary flex-1"
                        >
                          {(instapay ? ask.isPending : payInterest.isPending) ? 'Sending…' : `Pay Now - ${fmt(interestLeft)} only`}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card-base p-4">
              <p className="text-xs text-muted-foreground">{loan.repayment_type === 'dated' ? 'Next payment' : 'Monthly Payment'}</p>
              <p className="text-xl font-bold mt-1">{fmt(loan.repayment_type === 'dated' ? Math.max(0, (nextDue?.total_due ?? 0) - (nextDue?.total_paid ?? 0)) : (loan.monthly_payment ?? 0))}</p>
              {loan.repayment_type === 'dated' && nextDue && (
                <p className="text-xs text-muted-foreground mt-1">{formatDate(nextDue.due_date)}</p>
              )}
            </div>
            <div className="card-base p-4">
              <p className="text-xs text-muted-foreground">Interest Rate</p>
              <p className="text-xl font-bold mt-1">{formatPercent(loan.interest_rate ?? 0)}</p>
            </div>
            <div className="card-base p-4">
              <p className="text-xs text-muted-foreground">Total Repayment</p>
              <p className="text-xl font-bold mt-1">{fmt(loan.total_repayment ?? 0)}</p>
            </div>
          </div>

          <div className="card-base p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Repayment Progress</span>
              <span className="text-muted-foreground">{progressPct.toFixed(0)}% paid</span>
            </div>
            <div className="h-3 rounded-full bg-muted">
              <div className="h-3 rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Paid: {fmt(totalPaid)}</span>
              <span>Total: {fmt(totalDue)}</span>
            </div>
          </div>

          {nextDue && loan.status !== 'completed' && loan.payment_channel === 'instapay' && (
            <div className="card-base p-5 space-y-3">
              <p className="font-semibold">Pay with InstaPay</p>
              {(() => {
                const advance = quoteAdvance(schedule ?? [], loan.interest_rate ?? 0)
                const early = advance && advance.days_early > 0 && advance.interest_saved > 0
                return (
                  <p className="text-sm text-muted-foreground">
                    {early
                      ? `Pay ${fmt(advance.payoff_amount)} today and the interest drops by ${fmt(advance.interest_saved)}. Waiting until ${formatDate(advance.due_date)} keeps the full ${fmt(advance.scheduled_amount)}.`
                      : `Send ${fmt(nextDue.total_due + nextDue.late_fee)} to your lender by ${formatDate(nextDue.due_date)}.`}
                    {' '}The money does not go through this app. Your lender records it when it arrives.
                  </p>
                )
              })()}
              {instapayQr && <img src={instapayQr} alt="Lender InstaPay QR" className="w-56 rounded-xl border bg-white" />}
            </div>
          )}

          {nextDue && loan.status !== 'completed' && loan.payment_channel !== 'instapay' && (
            <div className="card-base p-5 space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Next Payment Due</p>
                  <p className="text-sm text-muted-foreground">{formatDate(nextDue.due_date)}</p>
                </div>
                <p className="text-2xl font-bold break-words">{fmt(nextDue.total_due + nextDue.late_fee)}</p>
              </div>

              {nextDue.late_fee > 0 && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  Includes late fee of {fmt(nextDue.late_fee)}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(['installment', 'custom', 'payoff'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPayMode(mode)}
                      className={`min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${payMode === mode ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}
                    >
                      {mode === 'installment' ? 'Pay installment' : mode === 'custom' ? 'Custom amount' : 'Pay off loan'}
                    </button>
                  ))}
                </div>

                {payMode === 'custom' && (
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">{symbol}</span>
                    <input
                      type="number"
                      value={payAmount ? payAmount / 100 : ''}
                      onChange={e => setPayAmount(Math.round(parseFloat(e.target.value) * 100))}
                      placeholder="Enter amount"
                      className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}

                {payMode === 'payoff' && payoffData && (
                  <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm">
                    <p className="font-medium text-green-800">Pay {fmt(payoffData.payoff_amount)} to close your loan</p>
                    <p className="text-green-700 mt-0.5">
                      {payoffData.interest_saved > 0
                        ? `Paying early removes ${fmt(payoffData.interest_saved)} of interest.`
                        : 'The interest stays as scheduled.'}
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    onClick={handlePayment}
                    disabled={paying || (payMode === 'custom' && !payAmount) || (walletData?.available_balance ?? 0) < (payMode === 'payoff' ? (payoffData?.payoff_amount ?? 0) : payMode === 'custom' ? (payAmount ?? 0) : nextDue.total_due + nextDue.late_fee)}
                    className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {paying ? 'Processing…' : 'Make Payment'}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Wallet balance: {fmt(walletData?.available_balance ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loan.status === 'completed' && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-green-900">Loan Fully Repaid!</h3>
              <p className="text-sm text-green-700 mt-1">Congratulations — you've completed your loan.</p>
            </div>
          )}
        </>
      )}

      {loan.status === 'rejected' && loan.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">Application Rejected</p>
          <p className="text-sm text-red-700 mt-1">{loan.rejection_reason}</p>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Payment Schedule</h2>
        {schedLoading ? <TableSkeleton /> : (
          <div className="card-base overflow-hidden">
            <div className="md:hidden divide-y divide-border">
              {schedule?.map(row => (
                <div key={row.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">#{row.installment_number} · {formatDate(row.due_date)}</p>
                    <ScheduleStatusIcon status={row.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Principal</p>
                      <p className="font-mono">{fmt(row.principal_due)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Interest</p>
                      <p className="font-mono">{fmt(row.interest_due)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-mono font-medium">{fmt(row.total_due)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Due Date</th>
                  <th className="text-right p-3 font-medium">Principal</th>
                  <th className="text-right p-3 font-medium">Interest</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="text-center p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule?.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{row.installment_number}</td>
                    <td className="p-3">{formatDate(row.due_date)}</td>
                    <td className="p-3 text-right font-mono">{fmt(row.principal_due)}</td>
                    <td className="p-3 text-right font-mono">{fmt(row.interest_due)}</td>
                    <td className="p-3 text-right font-mono font-medium">{fmt(row.total_due)}</td>
                    <td className="p-3">
                      <div className="flex justify-center"><ScheduleStatusIcon status={row.status} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {loan.ai_reasoning && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Credit Assessment</h2>
          <div className="card-base p-5 space-y-3">
            <div className="flex items-center gap-3">
              <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
              {loan.ai_confidence && (
                <span className="text-sm text-muted-foreground">Confidence: {(loan.ai_confidence * 100).toFixed(0)}%</span>
              )}
            </div>
            <p className="text-sm">{loan.ai_reasoning}</p>
            {loan.ai_risk_factors && loan.ai_risk_factors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Risk Factors</p>
                <ul className="space-y-1">
                  {loan.ai_risk_factors.map((f, i) => (
                    <li key={i} className="text-xs flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
