export type LoanStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'funding'
  | 'fully_funded'
  | 'active'
  | 'repaying'
  | 'completed'
  | 'defaulted'
  | 'cancelled'
  | 'rejected'

export type LoanPurpose =
  | 'debt_consolidation'
  | 'business'
  | 'education'
  | 'medical'
  | 'home_improvement'
  | 'auto'
  | 'personal'
  | 'other'

export type CreditGrade = 'A' | 'B' | 'C' | 'D' | 'E'

export type ScheduleStatus =
  | 'upcoming'
  | 'due'
  | 'paid'
  | 'partial'
  | 'late'
  | 'missed'
  | 'waived'

export interface Loan {
  currency?: string
  repayment_type?: import('./package.types').RepaymentType
  package_id?: string | null
  payment_frequency?: import('./package.types').PaymentFrequency | null
  max_term_days?: number | null
  id: string
  borrower_id: string
  amount_requested: number
  purpose: LoanPurpose
  purpose_description?: string
  term_months: number
  ai_credit_grade?: CreditGrade
  ai_confidence?: number
  ai_reasoning?: string
  ai_risk_factors?: string[]
  admin_override_grade?: CreditGrade
  debt_to_income_ratio?: number
  approved_amount?: number
  interest_rate?: number
  monthly_payment?: number
  total_repayment?: number
  origination_fee?: number
  origination_fee_percent?: number
  amount_funded: number
  funding_percent: number
  lender_count: number
  funding_deadline?: string
  fully_funded_at?: string
  status: LoanStatus
  rejection_reason?: string
  reviewed_by?: string
  reviewed_at?: string
  disbursed_at?: string
  first_payment_date?: string
  maturity_date?: string
  created_at: string
  updated_at: string
}

export interface LoanScheduleItem {
  id: string
  loan_id: string
  installment_number: number
  due_date: string
  principal_due: number
  interest_due: number
  total_due: number
  principal_paid: number
  interest_paid: number
  total_paid: number
  late_fee: number
  status: ScheduleStatus
  paid_at?: string
  days_late: number
  created_at: string
}
