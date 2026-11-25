import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

interface BorrowerAsk {
  id: string
  loan_id: string
  commitment_id: string | null
  kind: 'extension' | 'interest_only' | 'pay_in_full'
  requested_due_date: string | null
  amount: number | null
  currency?: string
  borrower_name: string
  title?: string
}

export function BorrowerRequests({ loanId }: { loanId?: string }) {
  const qc = useQueryClient()
  const { data: requests } = useQuery({
    queryKey: ['borrower-requests'],
    queryFn: async () => {
      const { data } = await api.get<{ requests: BorrowerAsk[] }>('/api/lender/borrower-requests')
      return data.requests ?? []
    },
  })

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accept' | 'decline' }) =>
      api.post(`/api/lender/borrower-requests/${id}/decide`, { decision }),
    onSuccess: (_res, variables) => {
      qc.invalidateQueries({ queryKey: ['borrower-requests'] })
      qc.invalidateQueries({ queryKey: ['lender-commitments'] })
      qc.invalidateQueries({ queryKey: ['lender-schedule'] })
      qc.invalidateQueries({ queryKey: ['commitment'] })
      toast.success(variables.decision === 'accept' ? 'Request accepted' : 'Request declined')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not update the request'
      toast.error(msg)
    },
  })

  const rows = (requests ?? []).filter(row => !loanId || row.loan_id === loanId)
  if (!rows.length) return null

  return (
    <section className="px-6 pb-4">
      <p className="caps">From borrowers</p>
      <div className="mt-2 divide-y divide-border border-y border-foreground">
        {rows.map(row => (
          <div key={row.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">
                {row.borrower_name}
                {row.commitment_id && (
                  <>
                    {' · '}
                    <Link to={`/lender/commitments/${row.commitment_id}`} className="hover:underline">{row.title?.replaceAll('_', ' ') || 'Loan'}</Link>
                  </>
                )}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {row.kind === 'extension'
                  ? `Extend the due date to ${row.requested_due_date ? formatDate(row.requested_due_date) : 'a later date'}. Extra interest ${formatCents(row.amount ?? 0, row.currency)}.`
                  : row.kind === 'pay_in_full'
                    ? `Record the full payment of ${formatCents(row.amount ?? 0, row.currency)} calculated through today. This closes the loan.`
                    : `Record ${formatCents(row.amount ?? 0, row.currency)} of interest calculated through today. The principal stays on the schedule.`}
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, decision: 'decline' })} className="min-h-11 text-sm font-semibold">Decline</button>
              <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, decision: 'accept' })} className="button-primary px-4">Accept</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
