import { cn } from '@/lib/utils'
import { LOAN_STATUS_LABELS } from '@lendflow/shared'
import type { LoanStatus } from '@lendflow/shared'

const statusStyles: Partial<Record<LoanStatus, string>> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-cyan-100 text-cyan-800',
  funding: 'bg-purple-100 text-purple-800',
  fully_funded: 'bg-indigo-100 text-indigo-800',
  active: 'bg-green-100 text-green-800',
  repaying: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-gray-100 text-gray-800',
  defaulted: 'bg-red-100 text-red-800',
  cancelled: 'bg-muted text-muted-foreground',
  rejected: 'bg-red-100 text-red-800',
}

interface Props {
  status: LoanStatus
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      statusStyles[status] ?? 'bg-muted text-muted-foreground',
      className
    )}>
      {LOAN_STATUS_LABELS[status] ?? status}
    </span>
  )
}
