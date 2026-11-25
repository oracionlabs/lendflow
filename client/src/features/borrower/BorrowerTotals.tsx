import { formatCents } from '@/lib/utils'
import { borrowerSnapshot } from '@/lib/loan-label'
import type { ScheduleBit } from '@/lib/loan-label'

export function BorrowerTotals({ loans }: { loans: { status: string; currency?: string; loan_schedule?: ScheduleBit[] }[] }) {
  const snap = borrowerSnapshot(loans)
  if (!snap.openCount) return null
  const money = (cents: number) => formatCents(cents, snap.currency)

  return (
    <section className="pb-2 pt-2 text-center">
      <p className="caps">Still owed</p>
      <p className="num mt-3 text-[44px] leading-none tracking-[-0.035em] sm:text-[56px]">{money(snap.owed)}</p>
      <div className="mx-auto mt-6 grid max-w-xs grid-cols-[1fr_1px_1fr] items-center">
        <div>
          <p className="num text-2xl">{money(snap.paid)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Paid</p>
        </div>
        <div className="mx-auto h-10 w-px bg-border" />
        <div>
          <p className={`num text-2xl ${snap.overdue > 0 ? 'text-accent' : ''}`}>{money(snap.overdue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Overdue</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {snap.openCount} open
        {snap.dueSoon > 0 ? ` · ${money(snap.dueSoon)} due within 7 days` : ''}
      </p>
    </section>
  )
}
