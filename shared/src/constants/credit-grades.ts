export const CREDIT_GRADE_RATES: Record<string, number> = {
  A: 0.0550,
  B: 0.0850,
  C: 0.1200,
  D: 0.1650,
  E: 0.2100,
}

export const CREDIT_GRADE_LABELS: Record<string, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Poor',
  E: 'High Risk',
}

export const SUPPORTED_TERMS = [6, 12, 18, 24, 36, 48, 60]
export const MIN_COMMITMENT_CENTS = 2500
export const MIN_LOAN_CENTS = 100_000
export const MAX_LOAN_CENTS = 5_000_000
