import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { formatCents } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { Download } from 'lucide-react'

interface OriginationRow { month: string; volume: number; count: number; funded: number }
interface NplRow { grade: string; total: number; defaulted: number; npl_rate: number }
interface RevenueRow { month: string; fees: number; cumulative: number }
interface CohortRow { month: string; originated: number; completed: number; defaulted: number; active: number; volume: number }

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', E: '#ef4444',
}

export function AdminReports() {
  const { data: origination, isLoading: origLoading } = useQuery({
    queryKey: ['admin-origination'],
    queryFn: async () => {
      const { data } = await api.get<{ origination: OriginationRow[] }>('/api/admin/reports/origination')
      return data.origination
    },
  })

  const { data: npl } = useQuery({
    queryKey: ['admin-npl'],
    queryFn: async () => {
      const { data } = await api.get<{ npl: NplRow[] }>('/api/admin/reports/npl')
      return data.npl
    },
  })

  const { data: revenue } = useQuery({
    queryKey: ['admin-revenue'],
    queryFn: async () => {
      const { data } = await api.get<{ revenue: RevenueRow[] }>('/api/admin/reports/revenue')
      return data.revenue
    },
  })

  const { data: cohort } = useQuery({
    queryKey: ['admin-cohort'],
    queryFn: async () => {
      const { data } = await api.get<{ cohort: CohortRow[] }>('/api/admin/reports/cohort')
      return data.cohort
    },
  })

  function downloadCSV(data: object[], filename: string) {
    if (!data.length) return
    const headers = Object.keys(data[0])
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (origLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    )
  }

  const totalVolume = origination?.reduce((s, r) => s + r.volume, 0) ?? 0
  const totalOriginated = origination?.reduce((s, r) => s + r.count, 0) ?? 0
  const totalRevenue = revenue?.slice(-1)[0]?.cumulative ?? 0
  const overallNPL = npl
    ? (npl.reduce((s, r) => s + r.defaulted, 0) / Math.max(1, npl.reduce((s, r) => s + r.total, 0))) * 100
    : 0

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform Reports</h1>
          <p className="text-muted-foreground mt-1">Origination trends, NPL analysis, and revenue (last 12 months)</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Loans Originated (12mo)', value: String(totalOriginated) },
          { label: 'Total Volume (12mo)', value: formatCents(totalVolume) },
          { label: 'Origination Fee Revenue', value: formatCents(totalRevenue), accent: true },
          { label: 'Overall NPL Rate', value: `${overallNPL.toFixed(2)}%`, warn: overallNPL > 5 },
        ].map(({ label, value, accent, warn }) => (
          <div key={label} className="card-base p-5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${accent ? 'text-emerald-700' : warn ? 'text-red-600' : ''}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Origination trends */}
      {origination && origination.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Monthly Origination Volume</h2>
            <button
              onClick={() => downloadCSV(origination, 'origination-trends.csv')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <div className="card-base p-5">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={origination}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tickFormatter={v => `$${(v / 100000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown, name: unknown) => name === 'Volume' ? formatCents(v as number) : (v as number)} />
                <Legend />
                <Bar yAxisId="left" dataKey="volume" name="Volume" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="count" name="Count" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* NPL by grade */}
      {npl && npl.some(r => r.total > 0) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">NPL Rate by Credit Grade</h2>
            <button
              onClick={() => downloadCSV(npl, 'npl-by-grade.csv')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <div className="card-base p-5">
            <div className="grid grid-cols-5 gap-3 mb-6">
              {npl.map(row => (
                <div key={row.grade} className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold" style={{ color: GRADE_COLORS[row.grade] }}>
                    {row.grade}
                  </div>
                  <div className="text-sm font-semibold mt-1">{row.npl_rate.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">{row.defaulted}/{row.total} loans</div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={npl}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => `${v}%`} />
                <Bar dataKey="npl_rate" name="NPL Rate (%)" radius={[2, 2, 0, 0]}>
                  {npl.map(row => (
                    <Cell key={row.grade} fill={GRADE_COLORS[row.grade] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Platform revenue */}
      {revenue && revenue.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Origination Fee Revenue</h2>
            <button
              onClick={() => downloadCSV(revenue, 'platform-revenue.csv')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <div className="card-base p-5">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => formatCents(v as number)} />
                <Legend />
                <Line type="monotone" dataKey="fees" name="Monthly Fees" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Cohort performance */}
      {cohort && cohort.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Cohort Performance</h2>
            <button
              onClick={() => downloadCSV(cohort, 'cohort-performance.csv')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Cohort</th>
                  <th className="text-right p-3 font-medium">Originated</th>
                  <th className="text-right p-3 font-medium">Active</th>
                  <th className="text-right p-3 font-medium">Completed</th>
                  <th className="text-right p-3 font-medium">Defaulted</th>
                  <th className="text-right p-3 font-medium">Default Rate</th>
                  <th className="text-right p-3 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {cohort.map(row => {
                  const defaultRate = row.originated > 0 ? ((row.defaulted / row.originated) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={row.month} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{row.month}</td>
                      <td className="p-3 text-right">{row.originated}</td>
                      <td className="p-3 text-right text-blue-600">{row.active}</td>
                      <td className="p-3 text-right text-emerald-600">{row.completed}</td>
                      <td className="p-3 text-right text-red-600">{row.defaulted}</td>
                      <td className="p-3 text-right">
                        <span className={parseFloat(defaultRate) > 5 ? 'text-red-600 font-medium' : ''}>
                          {defaultRate}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">{formatCents(row.volume)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
