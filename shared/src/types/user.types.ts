export type UserRole = 'borrower' | 'lender' | 'admin'
export type UserStatus = 'active' | 'suspended' | 'pending_verification'
export type EmploymentStatus = 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student'
export type CreditScoreRange = 'poor' | 'fair' | 'good' | 'very_good' | 'excellent'
export type DocumentType = 'government_id' | 'proof_of_income' | 'bank_statement' | 'proof_of_funds' | 'other'
export type DocumentStatus = 'pending' | 'verified' | 'rejected'
export type LenderType = 'individual' | 'institutional'
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive'

export interface User {
  id: string
  email: string
  name: string
  phone?: string
  role: UserRole
  avatar_url?: string
  status: UserStatus
  email_verified: boolean
  created_at: string
  updated_at: string
}

export interface BorrowerProfile {
  id: string
  user_id: string
  date_of_birth?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  zip?: string
  country: string
  employment_status?: EmploymentStatus
  employer?: string
  job_title?: string
  annual_income?: number
  monthly_expenses?: number
  credit_score_range?: CreditScoreRange
  identity_verified: boolean
  created_at: string
  updated_at: string
}

export interface LenderProfile {
  id: string
  user_id: string
  lender_type?: LenderType
  accredited: boolean
  risk_tolerance?: RiskTolerance
  identity_verified: boolean
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  type: DocumentType
  file_url: string
  file_name?: string
  status: DocumentStatus
  rejection_reason?: string
  uploaded_at: string
  reviewed_at?: string
}
