import type { LoanStatus } from '../types/loan.types'

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  funding: 'Seeking Funding',
  fully_funded: 'Fully Funded',
  active: 'Active',
  repaying: 'Repaying',
  completed: 'Completed',
  defaulted: 'Defaulted',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

export const LOAN_PURPOSE_LABELS: Record<string, string> = {
  debt_consolidation: 'Debt Consolidation',
  business: 'Business',
  education: 'Education',
  medical: 'Medical',
  home_improvement: 'Home Improvement',
  auto: 'Auto',
  personal: 'Personal',
  other: 'Other',
}
