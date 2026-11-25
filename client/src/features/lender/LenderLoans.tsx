import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { formatCents, useCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { type DashboardLoan } from '@/features/lender/CommitmentCard'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { FundingCommitment } from '@lendflow/shared'
import { TrendingUp } from 'lucide-react'
import { LenderCollections } from '@/features/lender/LenderCollections'
import { BorrowerRequests } from '@/features/lender/BorrowerRequests'

interface CommitmentWithLoan extends FundingCommitment {
  loans: DashboardLoan
}

const METHODS = ['InstaPay', 'Cash', 'Bank transfer']

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

function dayGap(due: string) {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${manilaToday()}T00:00:00Z`)) / 86400000)
}

function formatDue(due: string) {
  return new Date(`${due}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function personName(users: DashboardLoan['users']) {
  if (!users) return ''
  const row = Array.isArray(users) ? users[0] : users
  return row?.name ?? ''
}

function loanCode(id?: string) {
  if (!id) return ''
  return `L-${id.replace(/-/g, '').slice(-4).toUpperCase()}`
}

function openRows(loan: DashboardLoan) {
  return [...(loan.loan_schedule ?? [])]
    .filter(row => !['paid', 'waived'].includes(row.status))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.installment_number - b.installment_number)
}

function remainingOf(loan: DashboardLoan) {
  return openRows(loan).reduce((sum, row) => sum + Math.max(0, row.total_due - (row.total_paid ?? 0)), 0)
}

function typeLines(loan: DashboardLoan) {
  if (loan.loan_kind === 'product' && loan.product_name) return ['Product', loan.product_name]
  return ['Cash', LOAN_PURPOSE_LABELS[loan.purpose as keyof typeof LOAN_PURPOSE_LABELS] ?? loan.purpose]
}

function termLine(loan: DashboardLoan) {
  const count = loan.loan_schedule?.length ?? 0
  if (loan.repayment_type === 'dated' && count > 1) return `${count} dates`
  return `${loan.term_months} mo`
}

function paidOffOn(loan: DashboardLoan) {
  const dates = (loan.loan_schedule ?? []).map(row => row.paid_at).filter(Boolean) as string[]
  const latest = dates.sort().at(-1)?.slice(0, 10) ?? loan.maturity_date
  if (!latest) return ''
  return new Date(`${latest}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function LenderLoans() {
  return <LoanBook />
}

export function LoanBook() {
  useCurrency()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [received, setReceived] = useState(manilaToday())
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')

  const { data: commitments, isLoading } = useQuery({
    queryKey: ['lender-commitments'],
    queryFn: async () => {
      const { data } = await api.get<{ commitments: CommitmentWithLoan[] }>('/api/lender/commitments')
      return data.commitments ?? []
    },
  })

  const book = useMemo(() => (commitments ?? []).filter(item => item.loans), [commitments])
  const activeAll = useMemo(() => book
    .filter(item => ['active', 'repaying', 'approved', 'funding', 'fully_funded'].includes(item.loans?.status))
    .sort((a, b) => {
      const left = openRows(a.loans)[0]?.due_date ?? '9999'
      const right = openRows(b.loans)[0]?.due_date ?? '9999'
      return left.localeCompare(right)
    }), [book])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return book
    return book.filter(item => {
      const loan = item.loans
      const haystack = [
        personName(loan.users),
        loan.product_name,
        loan.purpose,
        loanCode(loan.id),
        typeLines(loan).join(' '),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [book, query])

  const active = rows
    .filter(item => ['active', 'repaying', 'approved', 'funding', 'fully_funded'].includes(item.loans?.status))
    .sort((a, b) => {
      const left = openRows(a.loans)[0]?.due_date ?? '9999'
      const right = openRows(b.loans)[0]?.due_date ?? '9999'
      return left.localeCompare(right)
    })
  const completed = rows.filter(item => item.loans?.status === 'completed')
  const selected = rows.find(item => item.id === selectedId) ?? null
  const selectedRemaining = selected ? remainingOf(selected.loans) : 0
  const typed = Math.round(Number(amount) * 100)
  const recordAmount = typed > 0 ? Math.min(typed, selectedRemaining) : selectedRemaining
  const partial = typed > 0 && typed < selectedRemaining

  const pay = useMutation({
    mutationFn: () => api.post(`/api/lender/loans/${selected?.loans.id}/instapay-payment`, {
      mode: partial ? 'partial' : 'full',
      amount: partial ? recordAmount : undefined,
      received_date: received,
      method,
      note,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lender-commitments'] })
      qc.invalidateQueries({ queryKey: ['lender-portfolio'] })
      setSelectedId(null)
      setAmount('')
      setNote('')
      toast.success(partial ? 'Partial payment recorded' : 'Payment recorded')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not record the payment'
      toast.error(msg)
    },
  })

  if (isLoading) return (
    <div className="mx-auto max-w-6xl space-y-3 px-6">
      {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )

  function openRecord(id: string) {
    setSelectedId(id)
    setAmount('')
    setReceived(manilaToday())
    setMethod('')
    setNote('')
  }

  return (
    <div className="mx-auto max-w-6xl">
      <BorrowerRequests />
      <LenderCollections commitments={activeAll} figuresOnly />
      <div className="px-6 pb-4 pt-2">
        <label className="caps text-muted-foreground" htmlFor="loan-search">Search loans</label>
        <input
          id="loan-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Borrower, loan, or product"
          className="mt-2 w-full border-b border-foreground bg-transparent py-2 text-sm outline-none"
        />
      </div>

      {!commitments?.length ? (
        <div className="px-6 py-16 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">No loans yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Accept a request or originate a new loan</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/lender/requests" className="button-primary px-5">View requests</Link>
            <Link to="/lender/new-loan" className="min-h-12 px-5 text-sm font-semibold">New loan</Link>
          </div>
        </div>
      ) : (
        <div className={selected ? 'lg:grid lg:grid-cols-[1fr_22rem]' : ''}>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-foreground text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-6 py-2 font-semibold">Borrower</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Lent</th>
                  <th className="px-3 py-2 font-semibold">Rate · term</th>
                  <th className="px-3 py-2 font-semibold">Remaining</th>
                  <th className="px-3 py-2 font-semibold">Next payment</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Active · {active.length}</td>
                </tr>
                {active.map(item => (
                  <PortfolioRow key={item.id} item={item} onRecord={() => openRecord(item.id)} />
                ))}
                <tr className="border-t border-foreground">
                  <td className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em]">Total</td>
                  <td />
                  <td className="num px-3 py-3">{formatCents(active.reduce((sum, item) => sum + item.amount, 0), active[0]?.loans.currency)}</td>
                  <td />
                  <td className="num px-3 py-3">{formatCents(active.reduce((sum, item) => sum + remainingOf(item.loans), 0), active[0]?.loans.currency)}</td>
                  <td colSpan={2} />
                </tr>
                {completed.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={7} className="px-6 pb-1 pt-6 text-[11px] font-semibold uppercase tracking-[0.16em]">Completed · {completed.length}</td>
                    </tr>
                    {completed.map(item => (
                      <PortfolioRow key={item.id} item={item} />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <aside className="border-t border-border bg-card p-6 lg:border-l lg:border-t-0">
              <p className="font-medium">Partial amount</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                {partial
                  ? 'Remaining balance stays on the schedule.'
                  : 'Leave this at zero to record the full remaining balance.'}
              </p>
              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="partial-amount">Amount</label>
              <div className="mt-1 flex items-end gap-1 border-b border-foreground">
                <span className="pb-2 text-muted-foreground">₱</span>
                <input
                  id="partial-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="num w-full bg-transparent py-2 text-2xl outline-none"
                />
              </div>
              <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="received-date">Date received</label>
              <input id="received-date" type="date" value={received} onChange={e => setReceived(e.target.value)} className="mt-1 w-full border-b border-border bg-transparent py-2 text-sm outline-none" />
              <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="pay-method">Method</label>
              <select id="pay-method" value={method} onChange={e => setMethod(e.target.value)} className="mt-1 w-full border-b border-border bg-transparent py-2 text-sm outline-none">
                <option value="">Select method</option>
                {METHODS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="pay-note">Note (optional)</label>
              <input id="pay-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Reference number, remarks..." className="mt-1 w-full border-b border-border bg-transparent py-2 text-sm outline-none" />
              <div className="mt-8 flex items-center gap-4">
                <button type="button" onClick={() => setSelectedId(null)} className="min-h-12 text-sm font-semibold">Cancel</button>
                <button
                  type="button"
                  disabled={pay.isPending || recordAmount <= 0 || selected.loans.payment_channel !== 'instapay'}
                  onClick={() => pay.mutate()}
                  className="button-primary flex-1"
                >
                  {pay.isPending ? 'Recording…' : `Record ${formatCents(recordAmount, selected.loans.currency)}`}
                </button>
              </div>
              {selected.loans.payment_channel !== 'instapay' && (
                <p className="mt-3 text-xs text-muted-foreground">This loan is paid through the wallet, not recorded here.</p>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function PortfolioRow({ item, onRecord }: { item: CommitmentWithLoan; onRecord?: () => void }) {
  const loan = item.loans
  const currency = loan.currency
  const next = openRows(loan)[0]
  const remaining = remainingOf(loan)
  const gap = next ? dayGap(next.due_date) : null
  const last = [...(loan.loan_schedule ?? [])].sort((a, b) => a.installment_number - b.installment_number).at(-1)
  const isFinal = !!next && !!last && next.installment_number === last.installment_number && (loan.loan_schedule?.length ?? 0) > 1
  const done = loan.status === 'completed'
  const [kind, detail] = typeLines(loan)

  return (
    <tr className="border-b border-border align-top hover:bg-card">
      <td className="px-6 py-3">
        <Link to={`/lender/commitments/${item.id}`} className="font-medium hover:underline">{personName(loan.users) || 'Borrower'}</Link>
        <p className="text-[12px] text-muted-foreground">{loanCode(loan.id)}</p>
      </td>
      <td className="px-3 py-3 text-[13px]">
        <p>{kind}</p>
        <p className="text-muted-foreground">{detail}</p>
      </td>
      <td className="num px-3 py-3">{formatCents(item.amount, currency)}</td>
      <td className="px-3 py-3 text-[13px]">
        <p>{((loan.interest_rate ?? 0) * 100).toFixed(1)}%</p>
        <p className="text-muted-foreground">{termLine(loan)}</p>
      </td>
      <td className="num px-3 py-3">{formatCents(remaining, currency)}</td>
      <td className="px-3 py-3 text-[13px]">
        {done ? (
          <p className="text-muted-foreground">Paid off {paidOffOn(loan)}</p>
        ) : next ? (
          <>
            <p>{formatDue(next.due_date)} · {gap === 0 ? 'today' : gap != null && gap < 0 ? `${Math.abs(gap)}d late` : `${gap}d`}</p>
            <p className="num">{formatCents(Math.max(0, next.total_due - (next.total_paid ?? 0)), currency)}{isFinal ? ' · final' : ''}</p>
          </>
        ) : (
          <p className="text-muted-foreground">No payment due</p>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        {onRecord && remaining > 0 && (
          <button type="button" onClick={onRecord} className="text-[13px] font-semibold text-accent">Record payment</button>
        )}
      </td>
    </tr>
  )
}
