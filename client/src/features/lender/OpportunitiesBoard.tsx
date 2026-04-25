import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatPercent, formatDate } from '@/lib/utils'
import { CreditGradeBadge } from '@/components/shared/CreditGradeBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import type { Loan } from '@lendflow/shared'
import { LOAN_PURPOSE_LABELS } from '@lendflow/shared'
import { Search } from 'lucide-react'

const grades = ['A', 'B', 'C', 'D', 'E']

export function OpportunitiesBoard() {
  const [filterGrade, setFilterGrade] = useState('')
  const [sort, setSort] = useState<'newest' | 'highest_yield' | 'most_funded' | 'ending_soon'>('newest')

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', filterGrade],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50' }
      if (filterGrade) params.grade = filterGrade
      const { data } = await api.get<{ loans: Loan[]; total: number }>('/api/loans', { params })
      return data
    },
  })

  const sorted = [...(data?.loans ?? [])].sort((a, b) => {
    if (sort === 'highest_yield') return (b.interest_rate ?? 0) - (a.interest_rate ?? 0)
    if (sort === 'most_funded') return (b.funding_percent ?? 0) - (a.funding_percent ?? 0)
    if (sort === 'ending_soon') return (a.funding_deadline ?? '').localeCompare(b.funding_deadline ?? '')
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lending Opportunities</h1>
        <p className="text-muted-foreground mt-1">Browse vetted loan applications seeking funding</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {grades.map(g => (
            <button
              key={g}
              onClick={() => setFilterGrade(filterGrade === g ? '' : g)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterGrade === g ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}
            >
              Grade {g}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={sort}
            onChange={e => setSort(e.target.value as typeof sort)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="newest">Newest</option>
            <option value="highest_yield">Highest Yield</option>
            <option value="most_funded">Most Funded</option>
            <option value="ending_soon">Ending Soon</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No opportunities available"
          description="Check back soon — new loan applications are reviewed and listed regularly."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map(loan => (
            <Link
              key={loan.id}
              to={`/lender/opportunities/${loan.id}`}
              className="flex flex-col rounded-xl border bg-card p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{LOAN_PURPOSE_LABELS[loan.purpose] ?? loan.purpose}</p>
                  <p className="text-sm text-muted-foreground">{loan.term_months} months</p>
                </div>
                <CreditGradeBadge grade={loan.admin_override_grade ?? loan.ai_credit_grade} />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Loan Amount</p>
                  <p className="font-semibold">{formatCents(loan.approved_amount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Interest Rate</p>
                  <p className="font-semibold text-emerald-700">{formatPercent(loan.interest_rate ?? 0)}</p>
                </div>
              </div>

              <div className="mt-auto space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Funded</span>
                  <span>{(loan.funding_percent ?? 0).toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${loan.funding_percent ?? 0}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{loan.lender_count} lender{loan.lender_count !== 1 ? 's' : ''}</span>
                  {loan.funding_deadline && <span>Deadline: {formatDate(loan.funding_deadline)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
