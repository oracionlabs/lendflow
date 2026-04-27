import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCents, formatDate, daysUntil } from '@/lib/utils'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { Loan } from '@lendflow/shared'
import { Search, ArrowRight, Clock, ChevronRight } from 'lucide-react'

export function BorrowerDashboard() {
  const { user } = useAuth()

  const { data: loans, isLoading } = useQuery({
    queryKey: ['borrower-loans'],
    queryFn: async () => {
      const { data } = await api.get<{ loans: Loan[] }>('/api/loans')
      return data.loans
    },
  })

  const activeLoans = loans?.filter(l => ['active', 'repaying'].includes(l.status)) ?? []
  const pendingApps = loans?.filter(l => ['submitted', 'under_review', 'approved', 'funding', 'fully_funded'].includes(l.status)) ?? []
  const pastLoans = loans?.filter(l => ['completed', 'rejected', 'cancelled', 'defaulted'].includes(l.status)) ?? []

  const nextPayment = activeLoans
    .filter(l => l.first_payment_date)
    .sort((a, b) => new Date(a.first_payment_date!).getTime() - new Date(b.first_payment_date!).getTime())[0]

  const daysLeft = nextPayment?.first_payment_date ? daysUntil(nextPayment.first_payment_date) : null

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold">Hi, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {loans?.length === 0 ? 'Ready to find a lender?' : `You have ${activeLoans.length} active loan${activeLoans.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Next payment card */}
      {nextPayment && daysLeft !== null && (
        <Link to={`/borrower/loans/${nextPayment.id}`}
          className={`block rounded-2xl p-5 text-white shadow-card-md active:scale-[0.99] transition-transform ${
            daysLeft <= 3 ? 'bg-red-500' : 'bg-primary'
          }`}>
          <p className="text-xs text-white/70 font-medium uppercase tracking-wide">
            {daysLeft <= 0 ? 'Payment due today' : `Payment in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
          </p>
          <p className="text-3xl font-bold mt-1">{formatCents(nextPayment.monthly_payment ?? 0)}</p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-white/80">
              {LOAN_PURPOSE_LABELS[nextPayment.purpose] ?? nextPayment.purpose}
            </p>
            <ArrowRight className="h-4 w-4 text-white/60" />
          </div>
        </Link>
      )}

      {/* CTA — Find a Lender */}
      {!isLoading && !pendingApps.length && (
        <Link to="/borrower/lenders"
          className="flex items-center justify-between rounded-2xl p-5 hover:brightness-105 transition-all active:scale-[0.99]"
          style={{ background: 'hsl(var(--lime))' }}>
          <div>
            <p className="font-semibold text-foreground">Find a Lender</p>
            <p className="text-sm text-foreground/70 mt-0.5">Browse available lenders and their terms</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-black/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-foreground" />
          </div>
        </Link>
      )}

      {/* Pending applications */}
      {pendingApps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm">Applications</h2>
            <Link to="/borrower/loans" className="text-xs text-primary">View all</Link>
          </div>
          <div className="space-y-2">
            {pendingApps.map(loan => (
              <Link key={loan.id} to={`/borrower/loans/${loan.id}`}
                className="flex items-center justify-between card-base p-4 active:scale-[0.99] transition-transform">
                <div>
                  <p className="font-medium text-sm">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                  <p className="text-xs text-muted-foreground">{formatCents(loan.amount_requested)} · {loan.term_months}mo</p>
                  {/* Status bar */}
                  {['submitted', 'under_review'].includes(loan.status) && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span className="text-[11px] text-amber-600 font-medium capitalize">{loan.status.replace('_', ' ')}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={loan.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Active loans */}
      {activeLoans.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm">Active Loans</h2>
            <Link to="/borrower/loans" className="text-xs text-primary">View all</Link>
          </div>
          <div className="space-y-2">
            {activeLoans.map(loan => (
              <Link key={loan.id} to={`/borrower/loans/${loan.id}`}
                className="flex items-center justify-between card-base p-4 active:scale-[0.99] transition-transform">
                <div>
                  <p className="font-medium text-sm">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(loan.approved_amount ?? 0)} · {formatCents(loan.monthly_payment ?? 0)}/mo
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty */}
      {!isLoading && !loans?.length && (
        <EmptyState
          icon={Search}
          title="No loans yet"
          description="Browse lenders to find the right terms for you."
          action={
            <Link to="/borrower/lenders" className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90">
              Browse Lenders
            </Link>
          }
        />
      )}

      {/* Past loans — compact */}
      {pastLoans.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm text-muted-foreground">Past</h2>
          </div>
          <div className="space-y-1">
            {pastLoans.slice(0, 3).map(loan => (
              <Link key={loan.id} to={`/borrower/loans/${loan.id}`}
                className="flex items-center justify-between rounded-xl px-4 py-3 hover:bg-muted transition-colors">
                <div>
                  <p className="text-sm font-medium">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                  <p className="text-xs text-muted-foreground">{formatCents(loan.amount_requested)} · {formatDate(loan.created_at)}</p>
                </div>
                <StatusBadge status={loan.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
