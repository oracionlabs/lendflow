export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'funding_commitment'
  | 'yield_distribution'
  | 'disbursement'
  | 'repayment'
  | 'origination_fee'
  | 'late_fee'
  | 'refund'

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed'

export interface Wallet {
  id: string
  user_id: string
  available_balance: number
  committed_balance: number
  pending_balance: number
  total_yield_earned: number
  currency: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  wallet_id: string
  type: TransactionType
  amount: number
  balance_after: number
  related_loan_id?: string
  related_commitment_id?: string
  description?: string
  status: TransactionStatus
  created_at: string
}
