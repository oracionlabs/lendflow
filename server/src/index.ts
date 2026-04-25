import 'dotenv/config'
import { createApp } from './app'
import { runLatePaymentJob } from './jobs/latePayments'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

const app = createApp()

app.listen(PORT, () => {
  console.log(`[server] LendFlow API running on http://localhost:${PORT}`)
})

// Run late payment detection daily (every 24 hours)
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
runLatePaymentJob().catch(err => console.error('[latePayments] initial run failed:', err))
setInterval(() => {
  runLatePaymentJob().catch(err => console.error('[latePayments] job failed:', err))
}, TWENTY_FOUR_HOURS)
