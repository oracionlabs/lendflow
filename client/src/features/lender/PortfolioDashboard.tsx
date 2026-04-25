import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatPercent } from '@/lib/utils'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import type { FundingCommitment } from '@lendflow/shared'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { TrendingUp, TrendingDown, Download, ArrowUpRight } from 'lucide-react'

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#f97316', E: '#ef4444',
}

interface PortfolioSummary {
  total_committed: number
  active_loans: number
  total_yield_earned: number
  projected_future_yield: number
  available_balance: number
  committed_balance: number
}

interface CommitmentWithLoan extends FundingCommitment {
  loans: {
    purpose: string
    term_months: number
    interest_rate: number
    ai_credit_grade?: string
    admin_override_grade?: string
    status: string
  }
}

export function PortfolioDashboard() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['lender-portfolio'],
    queryFn: async () => {
      const { data } = await api.get<PortfolioSummary>('/api/lender/portfolio/summary')
      return data
    },
  })

  const { data: commitments } = useQuery({
    queryKey: ['lender-commitments'],
    queryFn: async () => {
      const { data } = await api.get<{ commitments: CommitmentWithLoan[] }>('/api/lender/commitments')
      return data.commitments
    },
  })

  const { data: yieldChart } = useQuery({
    queryKey: ['yield-chart'],
    queryFn: async () => {
      const { data } = await api.get<{ chart: Array<{ month: string; amount: number; cumulative: number }> }>('/api/lender/portfolio/yield-chart')
      return data.chart
    },
  })

  const { data: diversification } = useQuery({
    queryKey: ['diversification'],
    queryFn: async () => {
      const { data } = await api.get<{ diversification: Array<{ grade: string; amount: number }> }>('/api/lender/portfolio/diversification')
      return data.diversification
    },
  })

  const peakMonthIdx = yieldChart
    ? yieldChart.reduce((best, row, i) => row.amount > (yieldChart[best]?.amount ?? 0) ? i : best, 0)
    : -1

  const activeCommitments = commitments?.filter(c => c.status === 'active') ?? []
  const completedCommitments = commitments?.filter(c => c.status === 'completed') ?? []

  const kpis = [
    { label: 'Total Committed', value: formatCents(summary?.total_committed ?? 0), sub: 'across active loans', delta: '+3.1%', up: true, active: true },
    { label: 'Active Loans', value: String(summary?.active_loans ?? 0), sub: 'commitments', delta: '+1', up: true, active: false },
    { label: 'Yield Earned', value: formatCents(summary?.total_yield_earned ?? 0), sub: 'lifetime interest income', delta: '+12.4%', up: true, active: false },
    { label: 'Projected Yield', value: formatCents(summary?.projected_future_yield ?? 0), sub: 'if no defaults', delta: '', up: true, active: false },
  ]

  if (isLoading) return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        <CardSkeleton />
      </div>
      <div className="w-72 space-y-4"><CardSkeleton /><CardSkeleton /></div>
    </div>
  )

  return (
    <div className="flex gap-6 min-h-full">
      {/* ── Main ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Portfolio</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your lending commitments and yield income</p>
          </div>
          <div className="flex gap-2">
            <Link to="/lender/opportunities" className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-muted transition-colors shadow-sm">
              Browse Opportunities
            </Link>
            <Link to="/lender/reports" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 shadow-sm">
              <Download className="h-4 w-4" /> Export
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map(({ label, value, sub, delta, up, active }) => (
            <div key={label} className={`rounded-xl bg-white p-4 shadow-sm transition-all ${active ? 'ring-2 ring-primary shadow-md' : 'border border-border'}`}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className="flex items-end justify-between mt-1">
                <p className="text-xl font-bold leading-tight">{value}</p>
                {delta && (
                  <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-primary' : 'text-destructive'}`}>
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Yield chart */}
        {yieldChart && yieldChart.length > 0 && (
          <div className="card-base p-5">
            <h2 className="font-semibold mb-4">Monthly Yield Income</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yieldChart} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(138 12% 91%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 11, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => formatCents(v)}
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(138 12% 88%)' }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} name="Yield">
                  {yieldChart.map((_, i) => (
                    <Cell key={i} fill={i === peakMonthIdx ? 'hsl(142 52% 38%)' : 'hsl(138 12% 88%)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Active commitments */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">My Commitments</h2>
            <Link to="/lender/opportunities" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Browse more <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {!commitments?.length ? (
            <EmptyState
              icon={TrendingUp}
              title="No commitments yet"
              description="Browse lending opportunities and fund your first loan to start earning yield."
              action={
                <Link to="/lender/opportunities" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90">
                  Browse Opportunities
                </Link>
              }
            />
          ) : (
            <>
              {/* In-process cards */}
              {activeCommitments.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
                  {activeCommitments.slice(0, 5).map(c => {
                    const grade = c.loans?.admin_override_grade ?? c.loans?.ai_credit_grade
                    return (
                      <div key={c.id} className="flex-shrink-0 w-48 card-base p-4">
                        <div className="flex gap-1 mb-3">
                          <div className="h-1 flex-1 rounded-full bg-primary" />
                          <div className="h-1 flex-1 rounded-full bg-primary/40" />
                          <div className="h-1 flex-1 rounded-full bg-muted" />
                        </div>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className="text-xs font-medium leading-tight capitalize">{LOAN_PURPOSE_LABELS[c.loans?.purpose] ?? c.loans?.purpose}</p>
                          {grade && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${GRADE_COLORS[grade]}20`, color: GRADE_COLORS[grade] }}>
                              {grade}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{c.loans?.term_months}mo · {c.loans?.interest_rate ? formatPercent(c.loans.interest_rate) : '—'}</p>
                        <p className="text-base font-bold mt-2">{formatCents(c.amount)}</p>
                        <p className="text-[11px] text-primary mt-0.5">+{formatCents(c.actual_yield)} yield</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Full table */}
              <div className="card-base overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <th className="text-left p-3 font-medium text-xs text-muted-foreground">Loan</th>
                      <th className="text-left p-3 font-medium text-xs text-muted-foreground">Grade</th>
                      <th className="text-right p-3 font-medium text-xs text-muted-foreground">Committed</th>
                      <th className="text-right p-3 font-medium text-xs text-muted-foreground">Share</th>
                      <th className="text-right p-3 font-medium text-xs text-muted-foreground">Rate</th>
                      <th className="text-right p-3 font-medium text-xs text-muted-foreground">Yield Earned</th>
                      <th className="text-center p-3 font-medium text-xs text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitments.map(c => (
                      <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <p className="font-medium text-xs">{LOAN_PURPOSE_LABELS[c.loans?.purpose] ?? c.loans?.purpose}</p>
                          <p className="text-[11px] text-muted-foreground">{c.loans?.term_months}mo</p>
                        </td>
                        <td className="p-3"><CreditGradeBadge grade={c.loans?.admin_override_grade ?? c.loans?.ai_credit_grade} /></td>
                        <td className="p-3 text-right font-mono text-xs">{formatCents(c.amount)}</td>
                        <td className="p-3 text-right text-xs">{c.share_percent?.toFixed(1)}%</td>
                        <td className="p-3 text-right text-xs text-primary font-medium">{formatPercent(c.loans?.interest_rate ?? 0)}</td>
                        <td className="p-3 text-right font-mono text-xs text-primary">{formatCents(c.actual_yield)}</td>
                        <td className="p-3 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            c.status === 'completed' ? 'bg-gray-100 text-gray-600'
                            : c.status === 'non_performing' ? 'bg-red-100 text-red-700'
                            : 'bg-primary/10 text-primary'
                          }`}>
                            {c.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 space-y-4">

        {/* Portfolio summary */}
        <div className="card-base p-4">
          <h3 className="text-sm font-semibold mb-3">Capital Summary</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Committed', value: formatCents(summary?.committed_balance ?? 0), color: 'text-amber-600' },
              { label: 'Yield Earned', value: formatCents(summary?.total_yield_earned ?? 0), color: 'text-primary' },
              { label: 'Projected Yield', value: formatCents(summary?.projected_future_yield ?? 0), color: 'text-muted-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio by grade */}
        {diversification && diversification.some(d => d.amount > 0) && (
          <div className="card-base p-4">
            <h3 className="text-sm font-semibold mb-3">Portfolio by Grade</h3>
            <div className="flex justify-center mb-3">
              <PieChart width={160} height={160}>
                <Pie data={diversification} dataKey="amount" nameKey="grade" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {diversification.map(entry => (
                    <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] ?? '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCents(v)} />
              </PieChart>
            </div>
            <div className="space-y-1.5">
              {diversification.filter(d => d.amount > 0).map(d => (
                <div key={d.grade} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: GRADE_COLORS[d.grade] }} />
                    <span className="text-xs text-muted-foreground">Grade {d.grade}</span>
                  </div>
                  <span className="text-xs font-medium">{formatCents(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed stats */}
        {completedCommitments.length > 0 && (
          <div className="card-base p-4">
            <h3 className="text-sm font-semibold mb-3">Completed</h3>
            <p className="text-2xl font-bold text-primary">{completedCommitments.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">loans fully repaid</p>
            <p className="text-sm font-semibold mt-2">
              {formatCents(completedCommitments.reduce((s, c) => s + c.actual_yield, 0))}
            </p>
            <p className="text-xs text-muted-foreground">total yield collected</p>
          </div>
        )}
      </div>
    </div>
  )
}
