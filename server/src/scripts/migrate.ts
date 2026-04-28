import 'dotenv/config'
import { runMigrations } from '../lib/migrate'

runMigrations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err.message)
    process.exit(1)
  })
