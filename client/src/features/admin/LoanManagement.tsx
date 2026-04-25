import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { toast } from 'sonner'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { Loan } from '@lendflow/shared'

type LoanWithUser = Loan & { users?: { name: string; email: string } }

export function LoanManagement() {
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Loan Management</h1>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!statusFilter ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}
        >
          All
        </button>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
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
                <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/30">
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
                        onClick={() => setDisburseId(loan.id)}
                        className="text-xs rounded-md bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                      >
                        Disburse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {disburseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-background p-6 space-y-4 m-4">
            <h3 className="font-bold text-lg">Disburse Loan</h3>
            <p className="text-sm text-muted-foreground">This will release funds to the borrower and start the repayment schedule.</p>
            <div className="flex gap-3">
              <button
                onClick={() => disburse.mutate(disburseId)}
                disabled={disburse.isPending}
                className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {disburse.isPending ? 'Processing…' : 'Confirm Disbursement'}
              </button>
              <button onClick={() => setDisburseId(null)} className="flex-1 rounded-md border py-2 text-sm hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
