import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { formatCents, useCurrency } from '@/lib/utils'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Shield } from 'lucide-react'

interface RiskData {
  at_risk_loans: Array<{
    loan_id: string
    approved_amount: number
    missed_payments: number
    late_payments: number
    threshold: number
    approaching_default: boolean
    status: string
  }>
  npl_by_grade: Array<{
    grade: string
    total: number
    defaulted: number
    npl_rate: number
  }>
}

export function RiskMonitor() {
  useCurrency() // subscribe to currency changes
  const { data, isLoading } = useQuery({
    queryKey: ['risk-monitor'],
    queryFn: async () => {
      const { data } = await api.get<RiskData>('/api/admin/risk/monitor')
      return data
    },
  })

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Risk Monitor</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">At-Risk Loans</h2>
        {isLoading ? <TableSkeleton /> : !data?.at_risk_loans.length ? (
          <EmptyState icon={Shield} title="No at-risk loans" description="All active loans are current on payments." />
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Loan</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-center p-3 font-medium">Missed</th>
                  <th className="text-center p-3 font-medium">Late</th>
                  <th className="text-center p-3 font-medium">Threshold</th>
                  <th className="text-center p-3 font-medium">Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {data.at_risk_loans.map(loan => (
                  <tr key={loan.loan_id} className={`border-b last:border-0 ${loan.approaching_default ? 'bg-red-50' : ''}`}>
                    <td className="p-3 font-mono text-xs">{loan.loan_id.slice(0, 8)}…</td>
                    <td className="p-3 text-right font-mono">{formatCents(loan.approved_amount)}</td>
                    <td className="p-3 text-center">{loan.missed_payments}</td>
                    <td className="p-3 text-center">{loan.late_payments}</td>
                    <td className="p-3 text-center text-muted-foreground">{loan.threshold}</td>
                    <td className="p-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${loan.approaching_default ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {loan.approaching_default ? 'Critical' : 'Watch'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">NPL Rate by Credit Grade</h2>
        <div className="grid grid-cols-5 gap-3">
          {data?.npl_by_grade.map(({ grade, total, defaulted, npl_rate }) => (
            <div key={grade} className={`rounded-xl border p-4 ${npl_rate > 10 ? 'border-red-200 bg-red-50' : npl_rate > 5 ? 'border-amber-200 bg-amber-50' : ''}`}>
              <p className="text-sm font-bold">Grade {grade}</p>
              <p className={`text-2xl font-bold mt-1 ${npl_rate > 10 ? 'text-red-700' : npl_rate > 5 ? 'text-amber-700' : 'text-foreground'}`}>
                {npl_rate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{defaulted}/{total} defaulted</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
