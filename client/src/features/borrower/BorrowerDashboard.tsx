import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCents, formatDate, daysUntil } from '@/lib/utils'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import type { Loan } from '@lendflow/shared'
import { PlusCircle, FileText, TrendingUp, Clock, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react'

const STATUS_STEPS = ['submitted', 'under_review', 'approved', 'funding', 'active']

function LoanStatusBar({ status }: { status: string }) {
  const idx = STATUS_STEPS.indexOf(status)
  const isTerminal = ['completed', 'rejected', 'cancelled', 'defaulted'].includes(status)
  if (isTerminal) return <StatusBadge status={status as Loan['status']} />
  return (
    <div className="flex items-center gap-1 mt-2">
      {STATUS_STEPS.map((_, i) => (
        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= idx ? 'bg-primary' : 'bg-muted'}`} />
      ))}
      <span className="ml-2 text-[11px] text-muted-foreground capitalize whitespace-nowrap">{status.replace('_', ' ')}</span>
    </div>
  )
}

export function BorrowerDashboard() {
  const { user } = useAuth()

  const { data: loans, isLoading } = useQuery({
    queryKey: ['borrower-loans'],
    queryFn: async () => {
      const { data } = await api.get<{ loans: Loan[] }>('/api/loans')
      return data.loans
    },
  })

  const { data: completion } = useQuery({
    queryKey: ['profile-completion'],
    queryFn: async () => {
      const { data } = await api.get<{ completion: number; canApply: boolean }>('/api/borrower/profile/completion')
      return data
    },
  })

  const activeLoans = loans?.filter(l => ['active', 'repaying'].includes(l.status)) ?? []
  const pendingApps = loans?.filter(l => ['submitted', 'under_review', 'approved', 'funding', 'fully_funded'].includes(l.status)) ?? []
  const pastLoans = loans?.filter(l => ['completed', 'rejected', 'cancelled', 'defaulted'].includes(l.status)) ?? []

  const nextPayment = activeLoans
    .filter(l => l.first_payment_date)
    .sort((a, b) => new Date(a.first_payment_date!).getTime() - new Date(b.first_payment_date!).getTime())[0]

  const totalBorrowed = [...activeLoans, ...pendingApps].reduce((s, l) => s + (l.approved_amount ?? l.amount_requested), 0)

  const kpis = [
    { label: 'Active Loans', value: String(activeLoans.length), sub: 'currently repaying', icon: TrendingUp, color: 'text-primary', active: true },
    { label: 'Applications', value: String(pendingApps.length), sub: 'in progress', icon: Clock, color: 'text-amber-600', active: false },
    { label: 'Total Borrowed', value: formatCents(totalBorrowed), sub: 'across all loans', icon: FileText, color: 'text-blue-600', active: false },
    { label: 'Completed', value: String(pastLoans.filter(l => l.status === 'completed').length), sub: 'loans fully repaid', icon: CheckCircle2, color: 'text-emerald-600', active: false },
  ]

  if (isLoading) return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
      <div className="w-72 space-y-4"><CardSkeleton /><CardSkeleton /></div>
    </div>
  )

  return (
    <div className="flex gap-6 min-h-full">
      {/* ── Main ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Welcome back, {user?.name?.split(' ')[0]}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your loans and applications</p>
          </div>
          {completion?.canApply && (
            <Link to="/borrower/apply" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 shadow-sm">
              <PlusCircle className="h-4 w-4" /> Apply for Loan
            </Link>
          )}
        </div>

        {/* Profile completion banner */}
        {completion && completion.completion < 80 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-amber-900 text-sm">Complete your profile to apply</p>
              <Link to="/borrower/profile" className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs text-white hover:bg-amber-800">
                Complete Profile
              </Link>
            </div>
            <div className="h-1.5 rounded-full bg-amber-200">
              <div className="h-1.5 rounded-full bg-amber-600 transition-all" style={{ width: `${completion.completion}%` }} />
            </div>
            <p className="text-xs text-amber-700 mt-1">{completion.completion}% complete</p>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map(({ label, value, sub, icon: Icon, color, active }) => (
            <div key={label} className={`rounded-xl bg-white p-4 shadow-sm ${active ? 'ring-2 ring-primary shadow-md' : 'border border-border'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!loans?.length && (
          <EmptyState
            icon={FileText}
            title="Ready to get started?"
            description="Apply for your first loan. The process takes just a few minutes."
            action={
              <Link to="/borrower/apply" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90">
                Apply for a Loan
              </Link>
            }
          />
        )}

        {/* Active loans — horizontal cards */}
        {activeLoans.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Active Loans</h2>
              <Link to="/borrower/loans" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                All <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {activeLoans.map(loan => {
                const daysLeft = loan.first_payment_date ? daysUntil(loan.first_payment_date) : null
                return (
                  <Link
                    key={loan.id}
                    to={`/borrower/loans/${loan.id}`}
                    className="flex-shrink-0 w-52 card-base p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex gap-1 mb-3">
                      <div className="h-1 flex-1 rounded-full bg-primary" />
                      <div className="h-1 flex-1 rounded-full bg-primary/40" />
                      <div className="h-1 flex-1 rounded-full bg-muted" />
                    </div>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className="text-xs font-medium leading-tight">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                      <StatusBadge status={loan.status} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{loan.term_months}mo · {loan.interest_rate ? `${(loan.interest_rate * 100).toFixed(1)}%` : '—'}</p>
                    <p className="text-base font-bold mt-2">{formatCents(loan.approved_amount ?? loan.amount_requested)}</p>
                    {daysLeft !== null && (
                      <p className={`text-[11px] mt-0.5 ${daysLeft <= 3 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {daysLeft <= 0 ? 'Payment due today' : `Payment in ${daysLeft}d`}
                      </p>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Applications */}
        {pendingApps.length > 0 && (
          <section>
            <h2 className="font-semibold mb-3">Applications</h2>
            <div className="space-y-2">
              {pendingApps.map(loan => (
                <Link
                  key={loan.id}
                  to={`/borrower/loans/${loan.id}`}
                  className="flex items-center justify-between card-base p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                      <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatCents(loan.amount_requested)} · {loan.term_months}mo</p>
                    {loan.status === 'funding' && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${loan.funding_percent}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{loan.funding_percent?.toFixed(0)}%</span>
                      </div>
                    )}
                    <LoanStatusBar status={loan.status} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Past loans */}
        {pastLoans.length > 0 && (
          <section>
            <h2 className="font-semibold mb-3">Past Applications</h2>
            <div className="card-base overflow-hidden">
              {pastLoans.map((loan, i) => (
                <Link
                  key={loan.id}
                  to={`/borrower/loans/${loan.id}`}
                  className={`flex items-center justify-between p-3 hover:bg-muted/30 transition-colors ${i > 0 ? 'border-t border-border/50' : ''}`}
                >
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

      {/* ── Right sidebar ──────────────────────────────── */}
      <div className="w-72 flex-shrink-0 space-y-4">

        {/* Next payment */}
        {nextPayment && (
          <div className="rounded-xl bg-primary p-4 text-white shadow-sm">
            <p className="text-xs text-white/70 font-medium uppercase tracking-wide">Next Payment</p>
            <p className="text-2xl font-bold mt-1">{formatCents(nextPayment.monthly_payment ?? 0)}</p>
            <p className="text-sm text-white/80 mt-0.5">
              {nextPayment.first_payment_date ? formatDate(nextPayment.first_payment_date) : '—'}
            </p>
            <p className="text-xs text-white/60 mt-1 capitalize">{LOAN_PURPOSE_LABELS[nextPayment.purpose] ?? nextPayment.purpose}</p>
            <Link
              to={`/borrower/loans/${nextPayment.id}`}
              className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-white/20 px-3 py-2 text-xs font-medium hover:bg-white/30 transition-colors"
            >
              Make Payment <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Profile completion */}
        {completion && (
          <div className="card-base p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Profile</h3>
              <Link to="/borrower/profile" className="text-[11px] text-primary font-medium hover:underline">Edit ↗</Link>
            </div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted-foreground">Completion</p>
              <p className="text-xs font-bold text-primary">{completion.completion}%</p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${completion.completion}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {completion.canApply ? 'Eligible to apply for loans' : 'Reach 80% to apply for loans'}
            </p>
          </div>
        )}

        {/* Loan summary */}
        <div className="card-base p-4">
          <h3 className="text-sm font-semibold mb-3">Loan Summary</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Active', value: activeLoans.length, color: 'text-primary' },
              { label: 'Pending', value: pendingApps.length, color: 'text-amber-600' },
              { label: 'Completed', value: pastLoans.filter(l => l.status === 'completed').length, color: 'text-emerald-600' },
              { label: 'Defaulted', value: pastLoans.filter(l => l.status === 'defaulted').length, color: 'text-destructive' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card-base p-4 space-y-2">
          <h3 className="text-sm font-semibold mb-1">Quick Actions</h3>
          <Link to="/borrower/apply" className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-muted transition-colors">
            <PlusCircle className="h-4 w-4 text-primary" />
            <span>New Application</span>
          </Link>
          <Link to="/borrower/loans" className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-muted transition-colors">
            <FileText className="h-4 w-4 text-primary" />
            <span>View All Loans</span>
          </Link>
          <Link to="/borrower/reports" className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-muted transition-colors">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span>Payment Reports</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
