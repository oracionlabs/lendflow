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

export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar (C$)' },
  { code: 'ZAR', label: 'ZAR — South African Rand (R)' },
  { code: 'NGN', label: 'NGN — Nigerian Naira (₦)' },
  { code: 'GHS', label: 'GHS — Ghanaian Cedi (₵)' },
  { code: 'KES', label: 'KES — Kenyan Shilling (KSh)' },
  { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'BRL', label: 'BRL — Brazilian Real (R$)' },
  { code: 'MXN', label: 'MXN — Mexican Peso (MX$)' },
  { code: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
  { code: 'PHP', label: 'PHP — Philippine Peso (₱)' },
]

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
