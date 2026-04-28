import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate, formatPercent } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import type { Loan, LoanScheduleItem } from '@lendflow/shared'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react'

const CANCEL_REASONS = [
  'No longer need the funds',
  'Found alternative financing',
  'Terms not suitable',
  'Taking too long',
  'Other',
]

const CANCELLABLE = ['draft', 'submitted', 'under_review', 'approved', 'funding', 'fully_funded', 'active', 'repaying']

function ScheduleStatusIcon({ status }: { status: string }) {
  if (status === 'paid') return <CheckCircle className="h-4 w-4 text-green-600" />
  if (status === 'late' || status === 'missed') return <AlertCircle className="h-4 w-4 text-red-600" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

export function ActiveLoanDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [payAmount, setPayAmount] = useState<number | null>(null)
  const [payMode, setPayMode] = useState<'installment' | 'custom' | 'payoff'>('installment')
  const [paying, setPaying] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelOther, setCancelOther] = useState('')

  const { data: loanData, isLoading: loanLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: async () => {
      const { data } = await api.get<{ loan: Loan }>(`/api/loans/${id}`)
      return data.loan
    },
  })

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

      await api.post(`/api/loans/${id}/payments`, { schedule_id: nextDue.id, amount })
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
    <div className="max-w-4xl space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</h1>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={loan.status} />
            <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-3xl font-bold">{fmt(loan.approved_amount ?? 0)}</p>
          <p className="text-sm text-muted-foreground">{loan.term_months} month term</p>
          {CANCELLABLE.includes(loan.status) && !showCancel && (
            <button
              onClick={() => setShowCancel(true)}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors ml-auto"
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
          <div className="flex gap-2">
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || (cancelReason === 'Other' && !cancelOther.trim())}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
            <button
              onClick={() => { setShowCancel(false); setCancelReason(CANCEL_REASONS[0]); setCancelOther('') }}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Keep Loan
            </button>
          </div>
        </div>
      )}

      {['active', 'repaying', 'completed'].includes(loan.status) && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="card-base p-4">
              <p className="text-xs text-muted-foreground">Monthly Payment</p>
              <p className="text-xl font-bold mt-1">{fmt(loan.monthly_payment ?? 0)}</p>
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

          {nextDue && loan.status !== 'completed' && (
            <div className="card-base p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Next Payment Due</p>
                  <p className="text-sm text-muted-foreground">{formatDate(nextDue.due_date)}</p>
                </div>
                <p className="text-2xl font-bold">{fmt(nextDue.total_due + nextDue.late_fee)}</p>
              </div>

              {nextDue.late_fee > 0 && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  Includes late fee of {fmt(nextDue.late_fee)}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex gap-3">
                  {(['installment', 'custom', 'payoff'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPayMode(mode)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${payMode === mode ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}
                    >
                      {mode === 'installment' ? 'Pay installment' : mode === 'custom' ? 'Custom amount' : 'Pay off loan'}
                    </button>
                  ))}
                </div>

                {payMode === 'custom' && (
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
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
                    <p className="text-green-700 mt-0.5">You'll save {fmt(payoffData.interest_saved)} in interest</p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePayment}
                    disabled={paying || (payMode === 'custom' && !payAmount) || (walletData?.available_balance ?? 0) < (nextDue.total_due + nextDue.late_fee)}
                    className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
