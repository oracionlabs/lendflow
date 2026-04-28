export interface PlatformSettings {
  id: string
  origination_fee_percent: number
  late_fee_flat: number
  late_fee_daily_percent: number
  grace_period_days: number
  default_threshold_missed: number
  min_loan_amount: number
  max_loan_amount: number
  min_commitment_amount: number
  supported_terms: number[]
  credit_grade_rates: Record<string, number>
  currency: string
  updated_at: string
}
