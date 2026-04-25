import { Router } from 'express'
import dashboardRouter from './dashboard'
import loansRouter from './loans'
import usersRouter from './users'
import settingsRouter from './settings'
import riskRouter from './risk'
import reportsRouter from './reports'

const router = Router()

router.use('/dashboard', dashboardRouter)
router.use('/loans', loansRouter)
router.use('/users', usersRouter)
router.use('/settings', settingsRouter)
router.use('/risk', riskRouter)
router.use('/reports', reportsRouter)

export default router
