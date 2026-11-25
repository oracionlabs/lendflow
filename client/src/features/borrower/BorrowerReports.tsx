import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { formatCents, formatDate, formatPercent, useCurrency } from '@/lib/utils'
import { CardSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { FileText, Download } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { LoanScheduleItem, Loan } from '@lendflow/shared'
import { loanTitle } from '@/lib/loan-label'

interface LoanWithPayments extends Loan {
  schedule?: LoanScheduleItem[]
}

interface ReportSummary {
  total_paid: number
  total_interest_paid: number
  total_principal_paid: number
  active_loans: number
  completed_loans: number
  interest_saved_early_payoff?: number
}

export function BorrowerReports() {
  useCurrency() // subscribe to currency changes
  const { data: loans, isLoading } = useQuery({
    queryKey: ['borrower-report-loans'],
    queryFn: async () => {
      const { data } = await api.get<{ loans: Loan[] }>('/api/loans')
      return data.loans.filter(l => ['active', 'repaying', 'completed'].includes(l.status))
    },
  })

  const activeAndCompleted = loans ?? []

  const summary: ReportSummary = {
    total_paid: 0,
    total_interest_paid: 0,
    total_principal_paid: 0,
    active_loans: 0,
    completed_loans: 0,
  }

  for (const loan of activeAndCompleted) {
    if (['active', 'repaying'].includes(loan.status)) summary.active_loans++
    if (loan.status === 'completed') summary.completed_loans++
  }

  const currentYear = new Date().getFullYear()

  function downloadCSV() {
    const rows = [
      ['Loan Purpose', 'Status', 'Original Amount', 'Term (months)', 'Interest Rate', 'Date Applied'],
      ...activeAndCompleted.map(l => [
        loanTitle(l),
        l.status,
        (l.approved_amount ?? l.amount_requested) / 100,
        l.term_months,
        l.interest_rate ? `${(l.interest_rate * 100).toFixed(2)}%` : '',
        formatDate(l.created_at),
      ]),
    ]
    const csv = rows.map(r => r.map(v => JSON.stringify(v ?? '')).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lendflow-loan-history-${currentYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadTransactions() {
    const response = await api.get('/api/reports/export?type=transactions', { responseType: 'blob' })
    const blob = new Blob([response.data as BlobPart], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lendflow-transactions-${currentYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Reports</h1>
          <p className="text-muted-foreground mt-1">Payment history and loan summaries</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={downloadCSV}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Loan Summary
          </button>
          <button
            onClick={downloadTransactions}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Transactions
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-base p-4 sm:p-5 min-w-0">
          <p className="text-xs text-muted-foreground">Active Loans</p>
          <p className="text-2xl font-bold mt-1">{summary.active_loans}</p>
          <p className="text-xs text-muted-foreground mt-0.5">currently repaying</p>
        </div>
        <div className="card-base p-4 sm:p-5 min-w-0">
          <p className="text-xs text-muted-foreground">Completed Loans</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{summary.completed_loans}</p>
          <p className="text-xs text-muted-foreground mt-0.5">fully repaid</p>
        </div>
        <div className="card-base p-4 sm:p-5 min-w-0">
          <p className="text-xs text-muted-foreground">Total Borrowing</p>
          <p className="text-xl sm:text-2xl font-bold mt-1 break-words">
            {formatCents(activeAndCompleted.reduce((s, l) => s + (l.approved_amount ?? l.amount_requested), 0))}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">across {activeAndCompleted.length} loan{activeAndCompleted.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Loan breakdown table */}
      {activeAndCompleted.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No loan history yet"
          description="Once you have active or completed loans, your payment history will appear here."
        />
      ) : (
        <section>
          <h2 className="text-lg font-semibold mb-3">Loan History</h2>
          <div className="rounded-lg border overflow-hidden">
            <div className="md:hidden divide-y">
              {activeAndCompleted.map(loan => {
                const totalInterest = loan.total_repayment && loan.approved_amount
                  ? loan.total_repayment - loan.approved_amount
                  : null
                return (
                  <div key={loan.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{loanTitle(loan)}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        loan.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {loan.status === 'completed' ? 'Completed' : 'Active'}
                      </span>
                    </div>
                    <p className="font-mono text-sm">{formatCents(loan.approved_amount ?? loan.amount_requested)}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Rate {loan.interest_rate ? formatPercent(loan.interest_rate) : '—'}</span>
                      <span>Term {loan.term_months}mo</span>
                      <span>Monthly {loan.monthly_payment ? formatCents(loan.monthly_payment) : '—'}</span>
                      <span>{totalInterest !== null ? `Total ${formatCents(loan.total_repayment!)}` : 'Total —'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Purpose</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-right p-3 font-medium">Rate</th>
                  <th className="text-right p-3 font-medium">Term</th>
                  <th className="text-right p-3 font-medium">Monthly Payment</th>
                  <th className="text-right p-3 font-medium">Total Cost</th>
                  <th className="text-center p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeAndCompleted.map(loan => {
                  const totalInterest = loan.total_repayment && loan.approved_amount
                    ? loan.total_repayment - loan.approved_amount
                    : null
                  return (
                    <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{loanTitle(loan)}</td>
                      <td className="p-3 text-right font-mono">{formatCents(loan.approved_amount ?? loan.amount_requested)}</td>
                      <td className="p-3 text-right">{loan.interest_rate ? formatPercent(loan.interest_rate) : '—'}</td>
                      <td className="p-3 text-right">{loan.term_months}mo</td>
                      <td className="p-3 text-right font-mono">{loan.monthly_payment ? formatCents(loan.monthly_payment) : '—'}</td>
                      <td className="p-3 text-right">
                        {totalInterest !== null ? (
                          <span className="text-muted-foreground text-xs">
                            {formatCents(loan.total_repayment!)}
                            <span className="text-red-500 ml-1">(+{formatCents(totalInterest)} interest)</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          loan.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {loan.status === 'completed' ? 'Completed' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* Interest breakdown */}
      {activeAndCompleted.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Interest Breakdown</h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-4">Total interest paid or projected across all loans</p>
              <div className="space-y-3">
                {activeAndCompleted.map(loan => {
                  const principal = loan.approved_amount ?? loan.amount_requested
                  const total = loan.total_repayment ?? principal
                  const interest = total - principal
                  const pct = total > 0 ? (interest / total) * 100 : 0
                  return (
                    <div key={loan.id}>
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between text-sm mb-1">
                        <span>{loanTitle(loan)}</span>
                        <span className="text-muted-foreground">{formatCents(interest)} interest on {formatCents(principal)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-2 rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
