import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { requireAuth } from './middleware/auth'
import { requireBorrower, requireLender, requireAdmin } from './middleware/requireRole'
import { errorHandler } from './middleware/errorHandler'

import authRouter from './routes/auth'
import usersRouter from './routes/users'
import borrowerRouter from './routes/borrower'
import lenderRouter from './routes/lender'
import loansRouter from './routes/loans'
import paymentsRouter from './routes/payments'
import fundingRouter from './routes/funding'
import walletRouter from './routes/wallet'
import notificationsRouter from './routes/notifications'
import reportsRouter from './routes/reports'
import listingsRouter from './routes/listings'
import adminRouter from './routes/admin/index'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean) as string[]

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
  app.use(express.json())
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'lendflow-api' }))

  app.use('/api/auth', authRouter)

  app.use('/api/users', requireAuth, usersRouter)
  app.use('/api/borrower', requireAuth, requireBorrower, borrowerRouter)
  app.use('/api/lender', requireAuth, requireLender, lenderRouter)
  app.use('/api/loans', requireAuth, loansRouter)
  app.use('/api/loans', requireAuth, requireBorrower, paymentsRouter)
  app.use('/api/loans', requireAuth, requireLender, fundingRouter)
  app.use('/api/wallet', requireAuth, walletRouter)
  app.use('/api/notifications', requireAuth, notificationsRouter)
  app.use('/api/reports', requireAuth, reportsRouter)
  app.use('/api/listings', requireAuth, listingsRouter)
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter)

  app.use(errorHandler as unknown as (err: unknown, req: Request, res: Response, next: NextFunction) => void)

  return app
}
