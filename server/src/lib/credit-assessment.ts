import Anthropic from '@anthropic-ai/sdk'
import type { CreditGrade } from '@lendflow/shared'

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export interface CreditAssessmentInput {
  annual_income: number
  monthly_expenses: number
  employment_status: string
  loan_amount: number
  term_months: number
  purpose: string
  credit_score_range: string
}

export interface CreditAssessmentResult {
  grade: CreditGrade
  confidence: number
  reasoning: string
  risk_factors: string[]
  debt_to_income_ratio: number
}

export async function assessCredit(input: CreditAssessmentInput): Promise<CreditAssessmentResult> {
  const monthly_income = Math.round(input.annual_income / 12)
  const proposed_payment = Math.round(input.loan_amount / input.term_months)
  const dti = monthly_income > 0
    ? (input.monthly_expenses + proposed_payment) / monthly_income
    : 1

  const prompt = `You are a credit analyst for a private lending platform. Assess this loan application and return ONLY valid JSON, no other text.

Applicant data:
- Annual income: $${(input.annual_income / 100).toFixed(2)}
- Monthly expenses: $${(input.monthly_expenses / 100).toFixed(2)}
- Employment: ${input.employment_status}
- Loan amount: $${(input.loan_amount / 100).toFixed(2)}
- Term: ${input.term_months} months
- Purpose: ${input.purpose}
- Self-reported credit: ${input.credit_score_range}
- Estimated DTI (with new loan): ${(dti * 100).toFixed(1)}%

Credit grades: A=lowest risk (5.5% rate), B=low-moderate (8.5%), C=moderate (12%), D=high (16.5%), E=highest risk (21%)

Return ONLY this JSON with no markdown:
{"grade":"A","confidence":0.85,"reasoning":"2-3 sentence explanation for lenders","risk_factors":["factor1","factor2"]}`

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content[0] as { text: string }).text.trim()
  const parsed = JSON.parse(text)

  return {
    grade: parsed.grade as CreditGrade,
    confidence: Number(parsed.confidence),
    reasoning: String(parsed.reasoning),
    risk_factors: Array.isArray(parsed.risk_factors) ? parsed.risk_factors : [],
    debt_to_income_ratio: parseFloat(dti.toFixed(4)),
  }
}
