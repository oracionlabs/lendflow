import { cn } from '@/lib/utils'
import type { CreditGrade } from '@lendflow/shared'

const gradeStyles: Record<CreditGrade, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-orange-100 text-orange-800 border-orange-200',
  E: 'bg-red-100 text-red-800 border-red-200',
}

interface Props {
  grade: CreditGrade | string | undefined | null
  className?: string
}

export function CreditGradeBadge({ grade, className }: Props) {
  if (!grade) return <span className="text-muted-foreground text-xs">Pending</span>
  const g = grade as CreditGrade
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
      gradeStyles[g] ?? 'bg-muted text-muted-foreground',
      className
    )}>
      Grade {grade}
    </span>
  )
}
