import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import { formatCents, formatDate } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { AlertTriangle, Clock, TrendingUp, TrendingDown, Download, FileText, RefreshCw, CheckCircle2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useNotifications } from '@/hooks/useNotifications'

interface DashboardData {
  origination: { total_loans: number; total_outstanding: number; pending_applications: number }
  npl_rate: number
  avg_time_to_fund_days: number
  revenue: { origination_fees_this_month: number }
  users: { total_borrowers: number; total_lenders: number; new_borrowers_this_month: number; new_lenders_this_month: number }
  active_loans: number
  alerts: { stale_pending_count: number; stale_funding_count: number }
}

interface MonthlyRow { month: string; volume: number; count: number; funded: number }

function ActivityHeatmap() {
  const weeks = 7
  const days = 7
  const now = new Date()
  const cells = Array.from({ length: weeks * days }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (weeks * days - 1 - i))
    const isToday = d.toDateString() === now.toDateString()
    const intensity = isToday ? 4 : Math.floor(Math.random() * 5)
    return { date: d, intensity }
  })

  const intensityClass = (n: number) => {
    if (n === 0) return 'bg-muted'
    if (n === 1) return 'bg-primary/20'
    if (n === 2) return 'bg-primary/40'
    if (n === 3) return 'bg-primary/65'
    return 'bg-primary'
  }

  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
      {Array.from({ length: weeks }, (_, w) =>
        Array.from({ length: days }, (_, d) => {
          const cell = cells[w * days + d]
          return (
            <div
              key={`${w}-${d}`}
              title={cell.date.toLocaleDateString()}
              className={`h-3.5 w-full rounded-[2px] ${intensityClass(cell.intensity)}`}
            />
          )
        })
      )}
    </div>
  )
}

const NOTIFICATION_ICONS: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  loan_status:       { icon: FileText,      color: 'text-blue-600',   bg: 'bg-blue-100' },
  payment_due:       { icon: Clock,         color: 'text-amber-600',  bg: 'bg-amber-100' },
  payment_received:  { icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-100' },
  loan_non_performing: { icon: AlertTriangle, color: 'text-red-600',  bg: 'bg-red-100' },
  commitment_funded: { icon: TrendingUp,    color: 'text-purple-600', bg: 'bg-purple-100' },
  yield_received:    { icon: TrendingUp,    color: 'text-emerald-600',bg: 'bg-emerald-100' },
  system:            { icon: RefreshCw,     color: 'text-gray-600',   bg: 'bg-gray-100' },
}

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const { data } = await api.get<DashboardData>('/api/admin/dashboard')
      return data
    },
  })

  const { data: origination } = useQuery({
    queryKey: ['admin-origination'],
    queryFn: async () => {
      const { data } = await api.get<{ origination: MonthlyRow[] }>('/api/admin/reports/origination')
      return data.origination
    },
  })

  const { data: recentLoans } = useQuery({
    queryKey: ['admin-recent-loans'],
    queryFn: async () => {
      const { data } = await api.get<{ loans: Array<{ id: string; purpose: string; amount_requested: number; status: string; created_at: string }> }>('/api/admin/loans?limit=6')
      return (data.loans ?? []).filter(l => ['submitted', 'under_review', 'approved', 'funding', 'fully_funded'].includes(l.status))
    },
  })

  const { data: notifData } = useNotifications()
  const notifications = notifData?.notifications?.slice(0, 8) ?? []

  const today = new Date()
  const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  const todayNotifs = notifications.filter(n => new Date(n.created_at).toDateString() === today.toDateString())

  const kpis = [
    {
      label: 'Total Originated',
      value: formatCents(data?.origination.total_outstanding ?? 0),
      sub: `${data?.origination.total_loans ?? 0} loans`,
      delta: '+2.2%',
      up: true,
      active: true,
    },
    {
      label: 'Applications (#)',
      value: String(data?.origination.pending_applications ?? 0),
      sub: 'pending review',
      delta: '+8.2%',
      up: true,
      active: false,
    },
    {
      label: 'NPL Rate',
      value: `${data?.npl_rate?.toFixed(2) ?? '0.00'}%`,
      sub: 'non-performing',
      delta: data?.npl_rate && data.npl_rate > 2 ? '+0.5%' : '-0.5%',
      up: !(data?.npl_rate && data.npl_rate > 2),
      active: false,
    },
    {
      label: 'Active Loans',
      value: String(data?.active_loans ?? 0),
      sub: 'repaying',
      delta: '+1.4%',
      up: true,
      active: false,
    },
  ]

  const activeMonthIdx = origination
    ? origination.reduce((best, row, i) => row.volume > (origination[best]?.volume ?? 0) ? i : best, 0)
    : -1

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
      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Overview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Platform performance at a glance</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/api/reports/export?type=transactions"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" />
              Export
            </Link>
          </div>
        </div>

        {/* Alerts */}
        {(data?.alerts.stale_pending_count || data?.alerts.stale_funding_count) ? (
          <div className="space-y-2">
            {(data.alerts.stale_pending_count ?? 0) > 0 && (
              <Link to="/admin/queue" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 hover:bg-amber-100 transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-sm text-amber-800"><strong>{data.alerts.stale_pending_count}</strong> application{data.alerts.stale_pending_count !== 1 ? 's' : ''} waiting over 48h for review</p>
              </Link>
            )}
            {(data.alerts.stale_funding_count ?? 0) > 0 && (
              <Link to="/admin/loans" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 hover:bg-amber-100 transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-sm text-amber-800"><strong>{data.alerts.stale_funding_count}</strong> loan{data.alerts.stale_funding_count !== 1 ? 's' : ''} in funding for over 14 days</p>
              </Link>
            )}
          </div>
        ) : null}

        {/* Performance KPIs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Performance</h2>
            <span className="rounded-lg border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground">Last Year ↓</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {kpis.map(({ label, value, sub, delta, up, active }) => (
              <div
                key={label}
                className={`rounded-xl bg-white p-4 shadow-sm transition-all ${
                  active ? 'ring-2 ring-primary shadow-md' : 'border border-border'
                }`}
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-bold leading-tight">{value}</p>
                  <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-primary' : 'text-destructive'}`}>
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Origination bar chart */}
        {origination && origination.length > 0 && (
          <section>
            <div className="card-base p-5">
              <h2 className="font-semibold mb-4">Monthly Origination Volume</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={origination} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(138 12% 91%)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `$${(v / 100000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'hsl(220 8% 48%)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: unknown) => formatCents(v as number)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(138 12% 88%)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                    {origination.map((_, i) => (
                      <Cell key={i} fill={i === activeMonthIdx ? 'hsl(142 52% 38%)' : 'hsl(138 12% 88%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* In-process applications */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold">In-Process Applications</h2>
              {data?.origination.pending_applications ? (
                <p className="text-xs text-muted-foreground">{data.origination.pending_applications} active</p>
              ) : null}
            </div>
            <Link to="/admin/queue" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              All ↗
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {(recentLoans ?? []).slice(0, 5).map(loan => {
              const statusColors: Record<string, string> = {
                submitted: 'bg-blue-500',
                under_review: 'bg-amber-500',
                approved: 'bg-purple-500',
                funding: 'bg-primary',
                fully_funded: 'bg-emerald-500',
              }
              const badgeStyles: Record<string, string> = {
                submitted: 'bg-blue-50 text-blue-700',
                under_review: 'bg-amber-50 text-amber-700',
                approved: 'bg-purple-50 text-purple-700',
                funding: 'bg-primary/10 text-primary',
                fully_funded: 'bg-emerald-50 text-emerald-700',
              }
              const label: Record<string, string> = {
                submitted: 'Submitted',
                under_review: 'Under Review',
                approved: 'Approved',
                funding: 'Funding',
                fully_funded: 'Fully Funded',
              }
              return (
                <Link
                  key={loan.id}
                  to={`/admin/loans`}
                  className="flex-shrink-0 w-48 card-base p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-1 mb-3">
                    {['bg-primary', 'bg-primary/50', 'bg-muted'].map((c, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full ${c}`} />
                    ))}
                  </div>
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <p className="text-xs font-medium capitalize leading-tight">{loan.purpose.replace('_', ' ')}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${badgeStyles[loan.status] ?? 'bg-gray-50 text-gray-600'}`}>
                      {label[loan.status] ?? loan.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">#{loan.id.slice(0, 7)} · {formatDate(loan.created_at)}</p>
                  <p className="text-base font-bold mt-2">{formatCents(loan.amount_requested)}</p>
                </Link>
              )
            })}
            {(!recentLoans || recentLoans.length === 0) && (
              <p className="text-sm text-muted-foreground py-4">No in-process applications</p>
            )}
          </div>
        </section>

        {/* Users + revenue quick stats */}
        <section>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Fees This Month', value: formatCents(data?.revenue.origination_fees_this_month ?? 0), accent: true },
              { label: 'Total Borrowers', value: String(data?.users.total_borrowers ?? 0) },
              { label: 'Total Lenders', value: String(data?.users.total_lenders ?? 0) },
              { label: 'Avg. Time to Fund', value: `${data?.avg_time_to_fund_days?.toFixed(1) ?? '0'} days` },
            ].map(({ label, value, accent }) => (
              <div key={label} className="card-base p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold mt-1 ${accent ? 'text-primary' : ''}`}>{value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 space-y-4">

        {/* Activity heatmap */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Daily Activity</h3>
            <span className="text-[11px] text-muted-foreground">Last 7 Weeks</span>
          </div>
          <ActivityHeatmap />
          <div className="flex justify-between mt-2">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <span key={i} className="text-[10px] text-muted-foreground w-3.5 text-center">{d}</span>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">{todayStr}</h3>
              <p className="text-[11px] text-muted-foreground">{todayNotifs.length} Notes</p>
            </div>
            <Link to="/admin/queue" className="text-[11px] font-medium text-primary hover:underline">All ↗</Link>
          </div>
          <div className="space-y-3">
            {(notifications ?? []).slice(0, 6).map(notif => {
              const cfg = NOTIFICATION_ICONS[notif.type] ?? NOTIFICATION_ICONS.system
              const Icon = cfg.icon
              const time = new Date(notif.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              return (
                <div key={notif.id} className="flex gap-2.5">
                  <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">{time} AM</p>
                    <p className="text-xs leading-tight mt-0.5 line-clamp-2">{notif.title}{notif.body ? ` • ${notif.body}` : ''}</p>
                  </div>
                </div>
              )
            })}
            {(!notifications || notifications.length === 0) && (
              <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
            )}
          </div>
        </div>

        {/* Team section */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Platform Stats</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Borrowers', value: data?.users.total_borrowers ?? 0, color: 'bg-blue-100 text-blue-700' },
              { label: 'Lenders', value: data?.users.total_lenders ?? 0, color: 'bg-emerald-100 text-emerald-700' },
              { label: 'New this month', value: `${data?.users.new_borrowers_this_month ?? 0} / ${data?.users.new_lenders_this_month ?? 0}`, color: 'bg-purple-100 text-purple-700' },
              { label: 'Active Loans', value: data?.active_loans ?? 0, color: 'bg-amber-100 text-amber-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-muted/40 p-2.5">
                <p className={`text-base font-bold ${color.split(' ')[1]}`}>{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
