import { Client } from "pg";
import fs from "fs";
import path from "path";

// Migrations live at <repo-root>/supabase/migrations/
// This file compiles to server/dist/lib/migrate.js, so we go up 3 levels.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

// Postgres error codes that mean "object already exists" — safe to skip
const ALREADY_EXISTS = new Set(["42P07", "42701", "42710", "42P16", "23505"]);

export async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL not set — skipping migrations");
    return;
  }

  console.log(url);

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows } = await client.query(
      "SELECT name FROM _migrations ORDER BY name",
    );
    const applied = new Set(rows.map((r: { name: string }) => r.name));

    const pending = getMigrationFiles().filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log("[migrate] All migrations up to date");
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[migrate] Applying ${file}…`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        const code = (err as { code?: string }).code ?? "";
        if (ALREADY_EXISTS.has(code)) {
          // Migration was applied manually before the runner existed — record it and move on
          console.warn(
            `[migrate] ⚠ ${file} already applied (recording as done)`,
          );
          await client.query(
            "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
            [file],
          );
        } else {
          throw new Error(
            `Migration ${file} failed: ${(err as Error).message}`,
          );
        }
      }
    }

    console.log(`[migrate] Done`);
  } finally {
    await client.end();
  }
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}
