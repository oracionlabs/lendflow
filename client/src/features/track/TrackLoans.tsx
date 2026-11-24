import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { LoanPurpose } from '@lendflow/shared'

interface ScheduleRow {
  installment_number: number
  due_date: string
  total_due: number
  total_paid?: number
  status: string
  paid_at?: string
  payment_note?: string
}

interface TrackLoan {
  id: string
  purpose: string
  loan_kind?: string
  product_name?: string | null
  status: string
  currency?: string
  approved_amount?: number
  amount_requested: number
  monthly_payment?: number
  total_repayment?: number
  verification_mode?: string
  payment_channel?: string
  loan_schedule?: ScheduleRow[]
}

interface TrackPayload {
  borrower_name: string
  lender_name: string
  instapay_qr?: string | null
  loans: TrackLoan[]
}

export function TrackLoans() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['track', token],
    queryFn: async () => {
      const { data } = await api.get<TrackPayload>(`/api/track/${token}`)
      return data
    },
  })

  if (isLoading) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-muted-foreground">Loading your loans…</div>
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg p-6 space-y-2">
        <h1 className="text-xl font-bold">Link not found</h1>
        <p className="text-sm text-muted-foreground">Ask your lender for a new loan link.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 pb-16">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Loans with {data.lender_name}</p>
        <h1 className="text-2xl font-bold mt-1">{data.borrower_name}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This page tracks the loan. Payments go to {data.lender_name} through InstaPay, not through Lendflow.
        </p>
      </div>

      <section className="card-base p-4 space-y-3">
        <h2 className="font-semibold">Pay with InstaPay</h2>
        {data.instapay_qr ? (
          <img src={data.instapay_qr} alt={`${data.lender_name} InstaPay QR`} className="w-full max-w-xs rounded-xl border bg-white" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Your lender has not added a bank QR yet. Pay them the way you already agreed in chat. They mark the payment received here.
          </p>
        )}
      </section>

      {data.loans.map(loan => {
        const amount = loan.approved_amount ?? loan.amount_requested
        const schedule = [...(loan.loan_schedule ?? [])].sort((a, b) => a.installment_number - b.installment_number)
        return (
          <section key={loan.id} className="card-base p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{loan.loan_kind === 'product' && loan.product_name ? loan.product_name : (LOAN_PURPOSE_LABELS[loan.purpose as LoanPurpose] ?? loan.purpose)}</p>
                {loan.loan_kind === 'product' && <p className="text-xs text-muted-foreground">Product loan</p>}
                <p className="text-xs text-muted-foreground capitalize">{loan.status.replaceAll('_', ' ')}</p>
              </div>
              <p className="font-bold">{formatCents(amount, loan.currency)}</p>
            </div>
            <div className="divide-y divide-border text-sm">
              {schedule.map(row => (
                <div key={row.installment_number} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p>#{row.installment_number} · {formatDate(row.due_date)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{row.status}{(row.total_paid ?? 0) > 0 ? ` · ${formatCents(row.total_paid ?? 0, loan.currency)} received` : ''}</p>
                  </div>
                  <p className="font-mono">{formatCents(Math.max(0, row.total_due - (row.total_paid ?? 0)) || row.total_due, loan.currency)}</p>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
