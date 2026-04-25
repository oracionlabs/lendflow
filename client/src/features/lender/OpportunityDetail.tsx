import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatPercent, formatDate } from '@/lib/utils'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { ArrowLeft } from 'lucide-react'

interface LoanDetail {
  id: string
  purpose: string
  purpose_description?: string
  term_months: number
  interest_rate: number
  approved_amount: number
  monthly_payment: number
  total_repayment: number
  ai_credit_grade?: string
  admin_override_grade?: string
  ai_confidence?: number
  ai_reasoning?: string
  ai_risk_factors?: string[]
  debt_to_income_ratio?: number
  amount_funded: number
  funding_percent: number
  lender_count: number
  funding_deadline?: string
  status: string
  borrower_summary?: {
    income_range: string
    employment_type: string
    credit_score_band: string
    dti_ratio: number
  }
}

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [commitAmount, setCommitAmount] = useState(25000)
  const [showFundModal, setShowFundModal] = useState(false)

  const { data: loan, isLoading } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: async () => {
      const { data } = await api.get<{ loan: LoanDetail }>(`/api/loans/${id}`)
      return data.loan
    },
  })

  const { data: yieldPreview } = useQuery({
    queryKey: ['yield-preview', id, commitAmount],
    queryFn: async () => {
      const { data } = await api.get<{
        share_percent: number
        projected_total_yield: number
        projected_monthly_yield: number
      }>(`/api/loans/${id}/yield-preview`, { params: { amount: commitAmount } })
      return data
    },
    enabled: commitAmount >= 2500 && !!loan,
  })

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const { data } = await api.get<{ wallet: { available_balance: number } }>('/api/wallet')
      return data.wallet
    },
  })

  const fund = useMutation({
    mutationFn: (amount: number) => api.post(`/api/loans/${id}/fund`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', id] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['lender-portfolio'] })
      setShowFundModal(false)
      toast.success('Commitment successful! Check your portfolio.')
      navigate('/lender')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Funding failed'
      toast.error(msg)
    },
  })

  if (isLoading) return <LoadingSkeleton lines={10} />
  if (!loan) return <p>Loan not found</p>

  const remainingAmount = loan.approved_amount - loan.amount_funded

  return (
    <div className="max-w-4xl space-y-8">
      <Link to="/lender/opportunities" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to opportunities
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</h1>
          {loan.purpose_description && (
            <p className="text-muted-foreground mt-1 max-w-xl">{loan.purpose_description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
            <StatusBadge status={loan.status as 'funding'} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Loan Amount', value: formatCents(loan.approved_amount) },
          { label: 'Interest Rate', value: formatPercent(loan.interest_rate), highlight: true },
          { label: 'Term', value: `${loan.term_months} months` },
          { label: 'Monthly Payment', value: formatCents(loan.monthly_payment) },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold mt-1 ${highlight ? 'text-emerald-700' : ''}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex justify-between text-sm font-medium">
          <span>Funding Progress</span>
          <span>{loan.lender_count} lender{loan.lender_count !== 1 ? 's' : ''} · {loan.funding_percent.toFixed(1)}% funded</span>
        </div>
        <div className="h-3 rounded-full bg-muted">
          <div className="h-3 rounded-full bg-primary transition-all" style={{ width: `${loan.funding_percent}%` }} />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Funded: {formatCents(loan.amount_funded)}</span>
          <span>Remaining: {formatCents(remainingAmount)}</span>
        </div>
        {loan.funding_deadline && (
          <p className="text-xs text-muted-foreground">Funding deadline: {formatDate(loan.funding_deadline)}</p>
        )}
      </div>

      {loan.borrower_summary && (
        <div className="rounded-lg border bg-card p-5">
          <h3 className="font-semibold mb-3">Borrower Profile <span className="text-xs font-normal text-muted-foreground">(anonymized)</span></h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-muted-foreground">Income Range</p><p className="font-medium">{loan.borrower_summary.income_range}</p></div>
            <div><p className="text-muted-foreground">Employment</p><p className="font-medium capitalize">{loan.borrower_summary.employment_type?.replace('_', ' ')}</p></div>
            <div><p className="text-muted-foreground">Credit Score Band</p><p className="font-medium capitalize">{loan.borrower_summary.credit_score_band?.replace('_', ' ')}</p></div>
            <div><p className="text-muted-foreground">Debt-to-Income</p><p className="font-medium">{((loan.borrower_summary.dti_ratio ?? 0) * 100).toFixed(1)}%</p></div>
          </div>
        </div>
      )}

      {loan.ai_reasoning && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h3 className="font-semibold">Credit Assessment</h3>
          <div className="flex items-center gap-3">
            <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
            {loan.ai_confidence && <span className="text-sm text-muted-foreground">Confidence: {(loan.ai_confidence * 100).toFixed(0)}%</span>}
          </div>
          <p className="text-sm">{loan.ai_reasoning}</p>
          {loan.ai_risk_factors && loan.ai_risk_factors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Risk Factors</p>
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
      )}

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Yield Calculator</h3>
        <div>
          <label className="block text-sm font-medium mb-1.5">Commitment Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
            <input
              type="number"
              value={commitAmount / 100}
              onChange={e => setCommitAmount(Math.round(parseFloat(e.target.value || '25') * 100))}
              min={25}
              max={(remainingAmount) / 100}
              step={25}
              className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Min $25 · Max {formatCents(remainingAmount)} (remaining)</p>
        </div>

        {yieldPreview && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Your Share</p>
              <p className="font-bold mt-0.5">{yieldPreview.share_percent.toFixed(2)}%</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Monthly Yield</p>
              <p className="font-bold mt-0.5 text-emerald-700">{formatCents(yieldPreview.projected_monthly_yield)}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Total Yield</p>
              <p className="font-bold mt-0.5 text-emerald-700">{formatCents(yieldPreview.projected_total_yield)}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFundModal(true)}
            disabled={loan.status !== 'funding' || commitAmount < 2500}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Fund This Loan
          </button>
          <p className="text-xs text-muted-foreground">Wallet: {formatCents(wallet?.available_balance ?? 0)} available</p>
        </div>
      </div>

      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-background p-6 space-y-5 m-4">
            <h3 className="text-lg font-bold">Confirm Funding Commitment</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatCents(commitAmount)}</span></div>
              {yieldPreview && <div className="flex justify-between"><span className="text-muted-foreground">Your share</span><span>{yieldPreview.share_percent.toFixed(2)}%</span></div>}
              {yieldPreview && <div className="flex justify-between"><span className="text-muted-foreground">Projected total yield</span><span className="text-emerald-700 font-medium">{formatCents(yieldPreview.projected_total_yield)}</span></div>}
            </div>
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Risk reminder:</strong> This is a Grade {loan.admin_override_grade ?? loan.ai_credit_grade} loan. Capital is at risk. This is not a guaranteed return.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => fund.mutate(commitAmount)}
                disabled={fund.isPending}
                className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {fund.isPending ? 'Processing…' : 'Confirm Commitment'}
              </button>
              <button onClick={() => setShowFundModal(false)} className="flex-1 rounded-md border py-2 text-sm font-medium hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
