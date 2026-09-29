import pg from 'pg'

const { Pool } = pg

function usesLocalPostgres(connectionString) {
  try {
    const hostname = new URL(connectionString).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

export function createDatabasePool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL is required. Add a PostgreSQL connection string to server/.env.')
  }

  return new Pool({
    connectionString: connectionString.trim(),
    ssl: usesLocalPostgres(connectionString) ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

const createTableStatements = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      avatar_public_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS vocabulary_sets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      cover_image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS vocabularies (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      meaning TEXT NOT NULL DEFAULT '',
      meaning_en TEXT NOT NULL DEFAULT '',
      meaning_vi TEXT NOT NULL DEFAULT '',
      part_of_speech TEXT,
      example TEXT,
      image_url TEXT,
      phonetic TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      set_id BIGINT,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'learned')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS review_history (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vocabulary_id BIGINT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      next_review_at TIMESTAMPTZ NOT NULL,
      interval_days INTEGER NOT NULL DEFAULT 0,
      ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5
    )
  `,
]

const safeColumnMigrations = [
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT',
  'ALTER TABLE vocabulary_sets ADD COLUMN IF NOT EXISTS user_id BIGINT',
  "ALTER TABLE vocabulary_sets ADD COLUMN IF NOT EXISTS cover_image_url TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE vocabulary_sets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS user_id BIGINT',
  "ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS phonetic TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS audio_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS meaning_en TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS meaning_vi TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS set_id BIGINT',
  'ALTER TABLE review_history ADD COLUMN IF NOT EXISTS user_id BIGINT',
]

const indexStatements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_lower_unique ON users(LOWER(BTRIM(display_name)))',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_sets_id_user ON vocabulary_sets(id, user_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabularies_id_user ON vocabularies(id, user_id)',
  'CREATE INDEX IF NOT EXISTS idx_vocabulary_sets_user_created ON vocabulary_sets(user_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_vocabularies_user_created ON vocabularies(user_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_vocabularies_user_set ON vocabularies(user_id, set_id)',
  'CREATE INDEX IF NOT EXISTS idx_review_history_user_reviewed ON review_history(user_id, reviewed_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_review_history_vocabulary_reviewed ON review_history(user_id, vocabulary_id, reviewed_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS idx_review_history_user_next_review ON review_history(user_id, next_review_at)',
]

const constraintMigrations = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocabulary_sets_user_required') THEN
    ALTER TABLE vocabulary_sets ADD CONSTRAINT vocabulary_sets_user_required CHECK (user_id IS NOT NULL) NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocabularies_user_required') THEN
    ALTER TABLE vocabularies ADD CONSTRAINT vocabularies_user_required CHECK (user_id IS NOT NULL) NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_history_user_required') THEN
    ALTER TABLE review_history ADD CONSTRAINT review_history_user_required CHECK (user_id IS NOT NULL) NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocabularies_user_id_fkey') THEN
    ALTER TABLE vocabularies ADD CONSTRAINT vocabularies_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocabulary_sets_user_id_fkey') THEN
    ALTER TABLE vocabulary_sets ADD CONSTRAINT vocabulary_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_history_user_id_fkey') THEN
    ALTER TABLE review_history ADD CONSTRAINT review_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocabularies_owned_set_fkey') THEN
    ALTER TABLE vocabularies ADD CONSTRAINT vocabularies_owned_set_fkey FOREIGN KEY (set_id, user_id)
      REFERENCES vocabulary_sets(id, user_id) ON DELETE SET NULL (set_id) NOT VALID;
  END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_history_owned_vocabulary_fkey') THEN
    ALTER TABLE review_history ADD CONSTRAINT review_history_owned_vocabulary_fkey FOREIGN KEY (vocabulary_id, user_id)
      REFERENCES vocabularies(id, user_id) ON DELETE CASCADE NOT VALID;
  END IF; END $$`,
]

const ownershipNotNullMigration = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM vocabulary_sets WHERE user_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM vocabularies WHERE user_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM review_history WHERE user_id IS NULL) THEN
      ALTER TABLE vocabulary_sets ALTER COLUMN user_id SET NOT NULL;
      ALTER TABLE vocabularies ALTER COLUMN user_id SET NOT NULL;
      ALTER TABLE review_history ALTER COLUMN user_id SET NOT NULL;
    END IF;
  END $$
`

export async function initializeDatabase(database) {
  const client = await database.connect()

  try {
    await client.query('BEGIN')
    for (const statement of createTableStatements) await client.query(statement)
    for (const statement of safeColumnMigrations) await client.query(statement)
    const duplicateDisplayName = await client.query(`
      SELECT LOWER(BTRIM(display_name)) AS normalized_display_name
      FROM users
      GROUP BY LOWER(BTRIM(display_name))
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    if (duplicateDisplayName.rowCount > 0) {
      throw new Error('Cannot enforce unique display names because existing users have case-insensitive duplicates. Resolve them before restarting.')
    }
    await client.query("UPDATE vocabularies SET meaning_en = meaning WHERE BTRIM(meaning_en) = '' AND BTRIM(meaning) <> ''")
    for (const statement of indexStatements) await client.query(statement)
    for (const statement of constraintMigrations) await client.query(statement)
    await client.query(ownershipNotNullMigration)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function withTransaction(database, work) {
  const client = await database.connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
