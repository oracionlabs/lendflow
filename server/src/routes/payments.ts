import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

router.get('/:loanId/payments', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('borrower_id')
    .eq('id', req.params.loanId)
    .single()

  if (!loan || loan.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' }); return
  }

  const { data, error } = await db
    .from('loan_schedule')
    .select('*')
    .eq('loan_id', req.params.loanId)
    .in('status', ['paid', 'partial', 'late'])
    .order('installment_number', { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ payments: data })
})

router.post('/:loanId/payments', async (req: Request, res: Response): Promise<void> => {
  const user = res.locals.user
  const { schedule_id, amount } = req.body as { schedule_id: string; amount: number }

  if (!schedule_id || !amount || amount <= 0) {
    res.status(400).json({ error: 'schedule_id and positive amount are required' })
    return
  }

  const db = supabaseAdmin()

  const { data: loan } = await db
    .from('loans')
    .select('borrower_id, status')
    .eq('id', req.params.loanId)
    .single()

  if (!loan || loan.borrower_id !== user.id) {
    res.status(404).json({ error: 'Loan not found' }); return
  }

  if (!['active', 'repaying'].includes(loan.status)) {
    res.status(400).json({ error: 'Loan is not in a payable state' }); return
  }

  const { data: wallet } = await db
    .from('wallets')
    .select('available_balance')
    .eq('user_id', user.id)
    .single()

  if (!wallet || wallet.available_balance < amount) {
    res.status(400).json({ error: 'Insufficient wallet balance' }); return
  }

  const { data, error } = await db.rpc('process_borrower_payment', {
    p_loan_id: req.params.loanId,
    p_schedule_id: schedule_id,
    p_amount: amount,
  })

  if (error) {
    if (error.message.includes('ALREADY_PAID')) {
      res.status(409).json({ error: 'This installment has already been paid' })
    } else if (error.message.includes('INSUFFICIENT_BALANCE')) {
      res.status(400).json({ error: 'Insufficient balance' })
    } else {
      res.status(500).json({ error: error.message })
    }
    return
  }

  res.json(data)
})

export default router
