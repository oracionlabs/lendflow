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
  note?: string | null
  receipt_url?: string | null
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
      toast.success(variables.decision === 'accept' ? 'Confirmed' : 'Declined')
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
          <div key={row.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-2">
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
                    ? `Says they paid ${formatCents(row.amount ?? 0, row.currency)} in full. Confirm only if you received it — that closes the loan.`
                    : `Record ${formatCents(row.amount ?? 0, row.currency)} of interest through today and move the principal due to ${row.requested_due_date ? formatDate(row.requested_due_date) : 'a later date'}.`}
              </p>
              {row.note && <p className="text-[13px]">Note: {row.note}</p>}
              {row.receipt_url && (
                <a href={row.receipt_url} target="_blank" rel="noreferrer" className="block">
                  <img src={row.receipt_url} alt="Payment receipt" className="max-h-48 max-w-full border border-border object-contain" />
                </a>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, decision: 'decline' })} className="min-h-11 text-sm font-semibold">
                {row.kind === 'pay_in_full' ? 'Not received' : 'Decline'}
              </button>
              <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, decision: 'accept' })} className="button-primary px-4">
                {row.kind === 'pay_in_full' ? 'Confirm paid' : 'Accept'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
