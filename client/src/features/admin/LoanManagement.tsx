import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import api from '@/lib/api'
import { formatCents, formatDate, useCurrency } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { Loan } from '@lendflow/shared'

type LoanWithUser = Loan & { users?: { name: string; email: string } }

export function LoanManagement() {
  useCurrency() // subscribe to currency changes
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [disburseId, setDisburseId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-loans', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50' }
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get<{ loans: LoanWithUser[]; total: number }>('/api/admin/loans', { params })
      return data
    },
  })

  const disburse = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/loans/${id}/disburse`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-loans'] })
      setDisburseId(null)
      toast.success('Loan disbursed successfully!')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Disbursement failed'
      toast.error(msg)
    },
  })

  const statuses = ['submitted', 'under_review', 'approved', 'funding', 'fully_funded', 'active', 'repaying', 'completed', 'defaulted', 'rejected', 'cancelled']

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div>
        <h1 className="page-heading">Loan Management</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Review every loan, status, and disbursement in one place.</p>
      </div>

      <div className="flex gap-2 flex-wrap rounded-2xl bg-card p-2 border border-border/80 shadow-card">
        <button
          onClick={() => setStatusFilter('')}
          className={`rounded-full px-3 min-h-11 text-xs font-medium transition-colors ${!statusFilter ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
        >
          All
        </button>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`rounded-full px-3 min-h-11 text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="card-base overflow-hidden">
          <div className="md:hidden divide-y divide-border">
            {data?.loans.map(loan => (
              <div
                key={loan.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/admin/loans/${loan.id}`)}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/admin/loans/${loan.id}`) }}
                className="p-4 space-y-3 cursor-pointer active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{loan.users?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground break-all">{loan.users?.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={loan.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Purpose</p>
                    <p>{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-mono">{formatCents(loan.approved_amount ?? loan.amount_requested)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Grade</p>
                    <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p>{formatDate(loan.created_at)}</p>
                  </div>
                </div>
                {loan.status === 'fully_funded' && (
                  <button
                    onClick={e => { e.stopPropagation(); setDisburseId(loan.id) }}
                    className="w-full min-h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Disburse
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-3 font-medium">Borrower</th>
                <th className="text-left p-3 font-medium">Purpose</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="text-center p-3 font-medium">Grade</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {data?.loans.map(loan => (
                <tr
                  key={loan.id}
                  onClick={() => navigate(`/admin/loans/${loan.id}`)}
                  className="border-b last:border-0 hover:bg-primary/[0.035] cursor-pointer transition-colors"
                >
                  <td className="p-3">
                    <p className="font-medium">{loan.users?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{loan.users?.email}</p>
                  </td>
                  <td className="p-3">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</td>
                  <td className="p-3 text-right font-mono">{formatCents(loan.approved_amount ?? loan.amount_requested)}</td>
                  <td className="p-3 text-center"><CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} /></td>
                  <td className="p-3 text-center"><StatusBadge status={loan.status} /></td>
                  <td className="p-3 text-muted-foreground">{formatDate(loan.created_at)}</td>
                  <td className="p-3">
                    {loan.status === 'fully_funded' && (
                      <button
                        onClick={e => { e.stopPropagation(); setDisburseId(loan.id) }}
                        className="text-xs rounded-md bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                      >
                        Disburse
                      </button>
                    )}
                    <ChevronRight className="inline h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {disburseId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card-lg space-y-4 sm:m-4 max-h-[100dvh] overflow-y-auto">
            <h3 className="font-bold text-lg">Disburse Loan</h3>
            <p className="text-sm text-muted-foreground">This will release funds to the borrower and start the repayment schedule.</p>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button onClick={() => setDisburseId(null)} className="flex-1 min-h-11 rounded-lg border text-sm hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => disburse.mutate(disburseId)}
                disabled={disburse.isPending}
                className="flex-1 min-h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {disburse.isPending ? 'Processing…' : 'Confirm Disbursement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
