import path from 'path'
import fs from 'fs'
import { config } from 'dotenv'
const envFile = process.env.ENV_FILE ?? '.env'
const envPath = fs.existsSync(path.resolve(process.cwd(), envFile))
  ? path.resolve(process.cwd(), envFile)
  : path.resolve(process.cwd(), '..', envFile)
config({ path: envPath, override: true })

import { runMigrations } from '../lib/migrate'

runMigrations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err.message)
    process.exit(1)
  })
