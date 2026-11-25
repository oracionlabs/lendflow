import { Link } from 'react-router-dom'
import { formatCents, formatDate } from '@/lib/utils'
import { collectionBucket, loanBalance } from '@/lib/loan-label'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { DashboardLoan } from './CommitmentCard'
import { ChevronRight } from 'lucide-react'

interface CollectionCommitment {
  id: string
  loans?: DashboardLoan | null
}

interface CollectionRow {
  id: string
  bucket: 'overdue' | 'today' | 'upcoming'
  due: string
  amount: number
  currency?: string
  name: string
  title: string
}

function personName(users: DashboardLoan['users']): string {
  if (!users) return ''
  const row = Array.isArray(users) ? users[0] : users
  return row?.name ?? ''
}

function rowsFor(commitments: CollectionCommitment[]): CollectionRow[] {
  const rows: CollectionRow[] = []
  for (const commitment of commitments) {
    const loan = commitment.loans
    if (!loan) continue
    const balance = loanBalance(loan.loan_schedule)
    if (!balance.nextDue || balance.remaining <= 0) continue
    const bucket = collectionBucket(balance.nextDue)
    if (!bucket) continue
    const next = [...(loan.loan_schedule ?? [])]
      .filter(row => !['paid', 'waived'].includes(row.status) && row.due_date === balance.nextDue)
      [0]
    const amount = next ? Math.max(0, next.total_due - (next.total_paid ?? 0)) : balance.remaining
    const title = loan.loan_kind === 'product' && loan.product_name
      ? loan.product_name
      : (LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose)
    rows.push({
      id: commitment.id,
      bucket,
      due: balance.nextDue,
      amount,
      currency: loan.currency,
      name: personName(loan.users) || title,
      title,
    })
  }
  return rows.sort((a, b) => a.due.localeCompare(b.due))
}

function CollectionList({ title, rows, empty }: { title: string; rows: CollectionRow[]; empty?: string }) {
  return (
    <div>
      <div className="flex items-end justify-between border-b border-foreground px-6 pb-2.5">
        <p className="caps">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-4 text-[12.5px] text-muted-foreground">{empty}</p>
      ) : rows.map(row => (
        <Link key={row.id} to={`/lender/commitments/${row.id}`} className="flex min-h-14 items-center gap-3 border-b border-border px-6 hover:bg-card">
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">{row.name}</span>
            <span className="block text-[12.5px] text-muted-foreground">{row.title} · {formatDate(row.due)}</span>
          </span>
          <span className="num text-lg">{formatCents(row.amount, row.currency)}</span>
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </Link>
      ))}
    </div>
  )
}

export function LenderCollections({ commitments, figuresOnly = false }: { commitments: CollectionCommitment[]; figuresOnly?: boolean }) {
  const rows = rowsFor(commitments)
  const dueToday = rows.filter(row => row.bucket === 'today')
  const upcoming = rows.filter(row => row.bucket === 'upcoming')
  const overdue = rows.filter(row => row.bucket === 'overdue')
  const currency = rows.find(row => row.currency)?.currency ?? commitments.find(item => item.loans?.currency)?.loans?.currency
  const sum = (list: CollectionRow[]) => list.reduce((total, row) => total + row.amount, 0)

  return (
    <section>
      <div className="px-6 pb-6 pt-2 text-center">
        <p className="caps">Due today</p>
        <p className="num mt-3 text-[44px] leading-none tracking-[-0.035em] sm:text-[56px]">{formatCents(sum(dueToday), currency)}</p>
        <div className="mx-auto mt-6 grid max-w-xs grid-cols-[1fr_1px_1fr] items-center">
          <div>
            <p className={`num text-2xl ${sum(overdue) > 0 ? 'text-accent' : ''}`}>{formatCents(sum(overdue), currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Overdue</p>
          </div>
          <div className="mx-auto h-10 w-px bg-border" />
          <div>
            <p className="num text-2xl">{formatCents(sum(upcoming), currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Next 7 days</p>
          </div>
        </div>
      </div>
      {!figuresOnly && (
        <>
          <CollectionList title="Due today" rows={dueToday} empty="Nothing due today." />
          <CollectionList title="Upcoming" rows={upcoming} empty="Nothing due in the next 7 days." />
          {overdue.length > 0 && <CollectionList title="Overdue" rows={overdue} />}
        </>
      )}
    </section>
  )
}
