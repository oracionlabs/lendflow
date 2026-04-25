export type CommitmentStatus = 'active' | 'repaying' | 'completed' | 'non_performing'

export interface FundingCommitment {
  id: string
  lender_id: string
  loan_id: string
  amount: number
  share_percent: number
  expected_yield: number
  actual_yield: number
  status: CommitmentStatus
  funded_at: string
  completed_at?: string
}

export interface YieldDistribution {
  id: string
  commitment_id: string
  schedule_id: string
  principal_return: number
  interest_return: number
  total_return: number
  distributed_at: string
}
