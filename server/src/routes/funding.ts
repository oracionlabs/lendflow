import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.post('/:loanId', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { amount } = req.body as { amount: number }

  if (!amount || typeof amount !== 'number' || amount < 2500) {
    res.status(400).json({ error: 'Minimum commitment is $25 (2500 cents)' })
    return
  }

  const db = supabaseAdmin()

  const { data, error } = await db.rpc('create_funding_commitment', {
    p_lender_id: user.id,
    p_loan_id: req.params.loanId,
    p_amount: amount,
  })

  if (error) {
    if (error.message.includes('LOAN_NOT_FUNDING')) {
      res.status(409).json({ error: 'This loan is no longer accepting funding' })
    } else if (error.message.includes('INSUFFICIENT_BALANCE')) {
      res.status(400).json({ error: 'Insufficient available balance' })
    } else if (error.message.includes('EXCEEDS_REMAINING:')) {
      const remaining = parseInt(error.message.split(':')[1])
      res.status(409).json({ error: 'Commitment exceeds remaining unfunded amount', remaining_cents: remaining })
    } else if (error.message.includes('BELOW_MINIMUM')) {
      res.status(400).json({ error: 'Minimum commitment is $25' })
    } else {
      res.status(500).json({ error: 'Failed to create commitment' })
    }
    return
  }

  res.status(201).json(data)
})

export default router
