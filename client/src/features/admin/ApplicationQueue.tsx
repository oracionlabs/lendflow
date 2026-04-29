import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate, formatPercent, useCurrency } from '@/lib/utils'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { ClipboardList } from 'lucide-react'

interface QueueItem {
  id: string
  amount_requested: number
  purpose: string
  term_months: number
  ai_credit_grade?: string
  ai_confidence?: number
  ai_reasoning?: string
  ai_risk_factors?: string[]
  debt_to_income_ratio?: number
  status: string
  created_at: string
  borrower_profiles?: {
    employment_status?: string
    annual_income?: number
    monthly_expenses?: number
    credit_score_range?: string
  }
}

export function ApplicationQueue() {
  useCurrency() // subscribe to currency changes
  const qc = useQueryClient()
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [approvedAmount, setApprovedAmount] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-queue'],
    queryFn: async () => {
      const { data } = await api.get<{ queue: QueueItem[] }>('/api/admin/loans/queue')
      return data.queue
    },
  })

  const review = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post(`/api/admin/loans/${id}/review`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-queue'] })
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] })
      setSelected(null)
      setAction(null)
      toast.success('Review submitted')
    },
    onError: () => toast.error('Review failed'),
  })

  const handleReview = () => {
    if (!selected || !action) return
    const body: Record<string, unknown> = { action }
    if (action === 'approve') {
      body.approved_amount = approvedAmount || selected.amount_requested
    } else {
      body.rejection_reason = rejectionReason || 'Application did not meet lending criteria'
    }
    review.mutate({ id: selected.id, body })
  }

  if (isLoading) return <TableSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Application Queue</h1>
        <span className="rounded-full bg-primary px-3 py-0.5 text-sm font-medium text-primary-foreground">
          {data?.length ?? 0} pending
        </span>
      </div>

      {!data?.length ? (
        <EmptyState icon={ClipboardList} title="Queue is clear" description="All applications have been reviewed." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Purpose</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="text-center p-3 font-medium">Grade</th>
                <th className="text-right p-3 font-medium">DTI</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Submitted</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{LOAN_PURPOSE_LABELS[item.purpose] ?? item.purpose}</td>
                  <td className="p-3 text-right font-mono">{formatCents(item.amount_requested)}</td>
                  <td className="p-3 text-center"><CreditGradeBadge grade={item.ai_credit_grade} /></td>
                  <td className="p-3 text-right">{item.debt_to_income_ratio ? `${(item.debt_to_income_ratio * 100).toFixed(1)}%` : '—'}</td>
                  <td className="p-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${item.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(item.created_at)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => { setSelected(item); setApprovedAmount(item.amount_requested); setAction(null) }}
                      className="text-xs rounded-md border px-3 py-1 hover:bg-accent transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-background overflow-y-auto max-h-[90vh]">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold">{LOAN_PURPOSE_LABELS[selected.purpose] ?? selected.purpose}</h2>
                  <p className="text-sm text-muted-foreground">{formatCents(selected.amount_requested)} · {selected.term_months} months</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selected.borrower_profiles && (
                  <>
                    <div><p className="text-muted-foreground">Employment</p><p className="font-medium capitalize">{selected.borrower_profiles.employment_status?.replace('_', ' ')}</p></div>
                    <div><p className="text-muted-foreground">Annual Income</p><p className="font-medium">{selected.borrower_profiles.annual_income ? formatCents(selected.borrower_profiles.annual_income) : '—'}</p></div>
                    <div><p className="text-muted-foreground">Monthly Expenses</p><p className="font-medium">{selected.borrower_profiles.monthly_expenses ? formatCents(selected.borrower_profiles.monthly_expenses) : '—'}</p></div>
                    <div><p className="text-muted-foreground">Credit Score</p><p className="font-medium capitalize">{selected.borrower_profiles.credit_score_range?.replace('_', ' ')}</p></div>
                  </>
                )}
                <div><p className="text-muted-foreground">DTI Ratio</p><p className="font-medium">{selected.debt_to_income_ratio ? `${(selected.debt_to_income_ratio * 100).toFixed(1)}%` : '—'}</p></div>
              </div>

              {selected.ai_reasoning && (
                <div className="rounded-lg bg-muted/40 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">AI Assessment</p>
                    <CreditGradeBadge grade={selected.ai_credit_grade} />
                    {selected.ai_confidence && <span className="text-xs text-muted-foreground">{(selected.ai_confidence * 100).toFixed(0)}% confidence</span>}
                  </div>
                  <p className="text-sm">{selected.ai_reasoning}</p>
                  {selected.ai_risk_factors?.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {f}
                    </p>
                  ))}
                </div>
              )}

              {!action && (
                <div className="flex gap-3">
                  <button onClick={() => setAction('approve')} className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    Approve
                  </button>
                  <button onClick={() => setAction('reject')} className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700">
                    Reject
                  </button>
                </div>
              )}

              {action === 'approve' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Approved Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                      <input type="number" value={approvedAmount / 100}
                        onChange={e => setApprovedAmount(Math.round(parseFloat(e.target.value) * 100))}
                        className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleReview} disabled={review.isPending} className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      {review.isPending ? 'Processing…' : 'Confirm Approval'}
                    </button>
                    <button onClick={() => setAction(null)} className="flex-1 rounded-md border py-2 text-sm hover:bg-accent">Cancel</button>
                  </div>
                </div>
              )}

              {action === 'reject' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Rejection Reason</label>
                    <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={3}
                      placeholder="This will be shown to the borrower..."
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleReview} disabled={review.isPending} className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                      {review.isPending ? 'Processing…' : 'Confirm Rejection'}
                    </button>
                    <button onClick={() => setAction(null)} className="flex-1 rounded-md border py-2 text-sm hover:bg-accent">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
