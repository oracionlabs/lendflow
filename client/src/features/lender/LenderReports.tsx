import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { TrendingUp, Download } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface YieldMonth {
  month: string
  amount: number
  cumulative: number
}

interface IncomeRow {
  date: string
  loan_purpose: string
  interest_income: number
  principal_return: number
  total: number
}

export function LenderReports() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(String(currentYear))

  const { data: yieldChart, isLoading: chartLoading } = useQuery({
    queryKey: ['yield-chart'],
    queryFn: async () => {
      const { data } = await api.get<{ chart: YieldMonth[] }>('/api/lender/portfolio/yield-chart')
      return data.chart
    },
  })

  const { data: summary } = useQuery({
    queryKey: ['lender-portfolio'],
    queryFn: async () => {
      const { data } = await api.get<{
        total_committed: number
        total_yield_earned: number
        projected_future_yield: number
        active_loans: number
      }>('/api/lender/portfolio/summary')
      return data
    },
  })

  async function downloadIncomeReport() {
    try {
      const response = await api.get(`/api/reports/export?type=income_summary&year=${selectedYear}`, { responseType: 'blob' })
      const blob = new Blob([response.data as BlobPart], { type: 'text/csv' })
      if (blob.size === 0) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lendflow-income-${selectedYear}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // 204 = no data for year
    }
  }

  async function downloadTransactions() {
    try {
      const response = await api.get(`/api/reports/export?type=transactions&year=${selectedYear}`, { responseType: 'blob' })
      const blob = new Blob([response.data as BlobPart], { type: 'text/csv' })
      if (blob.size === 0) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lendflow-transactions-${selectedYear}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    }
  }

  const years = [String(currentYear), String(currentYear - 1), String(currentYear - 2)]

  if (chartLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Statements</h1>
          <p className="text-muted-foreground mt-1">Yield history and annual income summaries</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm bg-background"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={downloadIncomeReport}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Income Report
          </button>
          <button
            onClick={downloadTransactions}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Transactions
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Committed', value: formatCents(summary?.total_committed ?? 0), sub: 'capital deployed' },
          { label: 'Active Loans', value: String(summary?.active_loans ?? 0), sub: 'commitments' },
          { label: 'Total Yield Earned', value: formatCents(summary?.total_yield_earned ?? 0), sub: 'lifetime interest income', accent: true },
          { label: 'Projected Yield', value: formatCents(summary?.projected_future_yield ?? 0), sub: 'remaining if no defaults' },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} className="card-base p-5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${accent ? 'text-emerald-700' : ''}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Yield over time chart */}
      {yieldChart && yieldChart.length > 0 ? (
        <section>
          <div className="card-base p-5">
            <h2 className="font-semibold mb-4">Monthly Yield Income</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={yieldChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => formatCents(v as number)} />
                <Legend />
                <Bar dataKey="amount" name="Monthly Yield" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="No yield history yet"
          description="Fund your first loan to start earning interest income."
        />
      )}

      {/* Cumulative yield line chart */}
      {yieldChart && yieldChart.length > 1 && (
        <section>
          <div className="card-base p-5">
            <h2 className="font-semibold mb-4">Cumulative Interest Income</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={yieldChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => formatCents(v as number)} />
                <Line type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} dot={false} name="Cumulative" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Annual income summary for tax purposes */}
      <section>
        <div className="card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Annual Interest Income Summary</h2>
              <p className="text-sm text-muted-foreground">For tax reporting purposes — {selectedYear}</p>
            </div>
            <button
              onClick={downloadIncomeReport}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Download {selectedYear} Statement
            </button>
          </div>
          <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>This report includes all interest income received through LendFlow in {selectedYear}.</p>
            <p className="mt-1">Interest income from peer lending is generally reported as ordinary income. Please consult your tax advisor for guidance specific to your situation.</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Interest Income ({selectedYear})</p>
              <p className="text-xl font-bold mt-1 text-emerald-700">
                {formatCents(
                  yieldChart
                    ?.filter(m => m.month.startsWith(selectedYear))
                    .reduce((s, m) => s + m.amount, 0) ?? 0
                )}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Monthly Average</p>
              <p className="text-xl font-bold mt-1">
                {(() => {
                  const yearMonths = yieldChart?.filter(m => m.month.startsWith(selectedYear)) ?? []
                  return formatCents(yearMonths.length ? yearMonths.reduce((s, m) => s + m.amount, 0) / yearMonths.length : 0)
                })()}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Months Active</p>
              <p className="text-xl font-bold mt-1">
                {yieldChart?.filter(m => m.month.startsWith(selectedYear) && m.amount > 0).length ?? 0}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
