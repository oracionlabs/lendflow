import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

// Migrations live at <repo-root>/supabase/migrations/
// This file compiles to server/dist/lib/migrate.js, so we go up 3 levels.
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations')

export async function runMigrations() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.warn('[migrate] DATABASE_URL not set — skipping migrations')
    return
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    // Create tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // If tracking table is empty but users table already exists, the DB was
    // set up manually — seed the tracking table without re-running the SQL.
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY name')
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name))

    if (appliedSet.size === 0) {
      const { rows } = await client.query(
        `SELECT to_regclass('public.users') AS exists`
      )
      if (rows[0]?.exists) {
        const files = getMigrationFiles()
        if (files.length > 0) {
          const values = files.map((f, i) => `($${i + 1})`).join(',')
          await client.query(
            `INSERT INTO _migrations (name) VALUES ${values} ON CONFLICT DO NOTHING`,
            files
          )
          console.log(`[migrate] Seeded ${files.length} existing migrations into tracking table`)
          return
        }
      }
    }

    // Apply any pending migrations in order
    const files = getMigrationFiles().filter(f => !appliedSet.has(f))
    if (files.length === 0) {
      console.log('[migrate] All migrations up to date')
      return
    }

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`[migrate] Applying ${file}…`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`[migrate] ✓ ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
      }
    }

    console.log(`[migrate] Applied ${files.length} migration(s)`)
  } finally {
    await client.end()
  }
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
}
