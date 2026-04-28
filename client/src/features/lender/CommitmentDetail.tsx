import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { formatCents, formatDate, formatPercent } from '@/lib/utils'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { CardSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { ArrowLeft, TrendingUp, XCircle } from 'lucide-react'

const CANCEL_REASONS = [
  'Borrower requested cancellation',
  'Unable to verify borrower',
  'Terms no longer suitable',
  'Funds no longer available',
  'Other',
]

const TERMINAL = ['completed', 'cancelled', 'rejected', 'defaulted']
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelOther, setCancelOther] = useState('')

  const { data: commitment, isLoading } = useQuery({
    queryKey: ['commitment', id],
    queryFn: async () => {
      const { data } = await api.get<{ commitment: CommitmentDetail }>(`/api/lender/commitments/${id}`)
      return data.commitment
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
    <div className="max-w-4xl space-y-6">
      <CardSkeleton />
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
    </div>
  )

  if (!commitment) return (
    <div className="text-center py-16 text-muted-foreground">Commitment not found</div>
  )

  const loan = commitment.loans
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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/lender" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Portfolio
        </Link>
      </div>

      {/* Header */}
      <div className="card-base p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</h1>
              <CreditGradeBadge grade={grade} />
            </div>
            <p className="text-sm text-muted-foreground">
              Funded {formatDate(commitment.funded_at)} · {loan.term_months}mo term · {formatPercent(loan.interest_rate)}
            </p>
          </div>
          <div className="text-right space-y-2">
            <p className="text-2xl font-bold">{formatCents(commitment.amount)}</p>
            <p className="text-sm text-muted-foreground">{commitment.share_percent.toFixed(2)}% share</p>
            {!TERMINAL.includes(loan.status) && !showCancel && (
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
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div>
              <p className="font-semibold text-destructive text-sm">Cancel this loan</p>
              <p className="text-xs text-muted-foreground mt-0.5">Please provide a reason for cancellation.</p>
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
                placeholder="Please describe your reason…"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive resize-none"
              />
            )}
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

        <div className="mt-5 grid grid-cols-4 gap-4">
          {[
            { label: 'Committed', value: formatCents(commitment.amount), color: '' },
            { label: 'Yield Earned', value: formatCents(commitment.actual_yield), color: 'text-primary' },
            { label: 'Expected Yield', value: formatCents(commitment.expected_yield), color: '' },
            { label: 'Status', value: commitment.status.replace('_', ' '), color: commitment.status === 'non_performing' ? 'text-destructive' : commitment.status === 'completed' ? 'text-emerald-600' : 'text-primary' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-base font-bold mt-0.5 capitalize ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Yield progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Yield progress</span>
            <span>{yieldProgress.toFixed(0)}% of expected</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, yieldProgress)}%` }} />
          </div>
        </div>
      </div>

      {/* Loan details */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h2 className="font-semibold mb-4 text-sm">Loan Terms</h2>
          <div className="space-y-3">
            {[
              { label: 'Loan Amount', value: formatCents(loan.approved_amount) },
              { label: 'Monthly Payment', value: formatCents(loan.monthly_payment) },
              { label: 'Total Repayment', value: formatCents(loan.total_repayment) },
              { label: 'First Payment', value: loan.first_payment_date ? formatDate(loan.first_payment_date) : '—' },
              { label: 'Maturity', value: loan.maturity_date ? formatDate(loan.maturity_date) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {loan.ai_reasoning && (
          <div className="card-base p-5">
            <h2 className="font-semibold mb-3 text-sm">Credit Assessment</h2>
            <div className="flex items-center gap-2 mb-2">
              <CreditGradeBadge grade={grade} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5">{loan.ai_reasoning}</p>
          </div>
        )}
      </div>

      {/* Yield chart */}
      {chartData.length > 0 && (
        <div className="card-base p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Monthly Yield Received</h2>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(138 12% 91%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 11, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => formatCents(v as number)} />
              <Bar dataKey="interest" name="Interest" fill="hsl(142 52% 38%)" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="principal" name="Principal" fill="hsl(142 52% 70%)" radius={[3, 3, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Distribution history */}
      <div>
        <h2 className="font-semibold mb-3">Distribution History</h2>
        {!yields?.length ? (
          <div className="card-base p-8 text-center text-sm text-muted-foreground">
            No distributions yet — payments will appear here as the borrower repays.
          </div>
        ) : (
          <div className="card-base overflow-hidden">
            <table className="w-full text-sm">
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
                    <td className="p-3 text-right font-mono text-xs">{formatCents(y.principal_return)}</td>
                    <td className="p-3 text-right font-mono text-xs text-primary">{formatCents(y.interest_return)}</td>
                    <td className="p-3 text-right font-mono text-xs font-medium">{formatCents(y.total_return)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
