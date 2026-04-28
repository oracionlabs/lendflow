export type RepaymentType =
  | 'installments'
  | 'lump_sum'
  | 'interest_only'
  | 'daily_interest'
  | 'custom_schedule'

export type RatePeriod =
  | 'per_15_days'
  | 'per_30_days'
  | 'monthly'
  | 'annually'
  | 'flat'
  | 'daily'

export type PaymentFrequency = 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly'

export interface LoanPackage {
  id: string
  listing_id: string
  name: string
  description: string | null
  repayment_type: RepaymentType
  interest_rate: number
  rate_period: RatePeriod
  term_months: number | null
  max_term_days: number | null
  payment_frequency: PaymentFrequency | null
  min_loan: number | null
  max_loan: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
  installments:    'Monthly Installments',
  lump_sum:        'Single Repayment',
  interest_only:   'Interest-Only + Balloon',
  daily_interest:  'Daily Interest (Flexible)',
  custom_schedule: 'Custom Schedule',
}

export const RATE_PERIOD_LABELS: Record<RatePeriod, string> = {
  per_15_days: '/ 15 days',
  per_30_days: '/ 30 days',
  monthly:     '/ month',
  annually:    '/ year',
  flat:        'flat total',
  daily:       '/ day',
}

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  weekly:    'Weekly',
  bi_weekly: 'Bi-weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
}
