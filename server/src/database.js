import sqlite3 from 'sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const dataDirectory = join(currentDirectory, '..', 'data')
const databasePath = join(dataDirectory, 'flashcards.db')

mkdirSync(dataDirectory, { recursive: true })

const db = new sqlite3.Database(databasePath)

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS vocabulary_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cover_image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS vocabularies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      meaning TEXT NOT NULL DEFAULT '',
      meaning_en TEXT NOT NULL DEFAULT '',
      meaning_vi TEXT NOT NULL DEFAULT '',
      part_of_speech TEXT,
      example TEXT,
      image_url TEXT,
      phonetic TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      set_id INTEGER,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'learning', 'learned')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (set_id) REFERENCES vocabulary_sets(id) ON DELETE SET NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vocabulary_id INTEGER NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
      reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      next_review_at TEXT NOT NULL,
      interval_days INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      FOREIGN KEY (vocabulary_id) REFERENCES vocabularies(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_review_history_vocabulary_reviewed
    ON review_history(vocabulary_id, reviewed_at DESC, id DESC)
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_review_history_reviewed_at
    ON review_history(reviewed_at DESC)
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_review_history_next_review_at
    ON review_history(next_review_at)
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vocabulary_created_at
    ON vocabularies(created_at DESC)
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vocabulary_sets_created_at
    ON vocabulary_sets(created_at DESC)
  `)

  db.all('PRAGMA table_info(vocabularies)', (error, columns) => {
    if (error) {
      console.error('Could not inspect the vocabularies table.', error)
      return
    }

    const columnNames = new Set(columns.map((column) => column.name))

    if (!columnNames.has('phonetic')) {
      db.run("ALTER TABLE vocabularies ADD COLUMN phonetic TEXT NOT NULL DEFAULT ''", (migrationError) => {
        if (migrationError) {
          console.error('Could not add the phonetic column.', migrationError)
        }
      })
    }

    if (!columnNames.has('audio_url')) {
      db.run("ALTER TABLE vocabularies ADD COLUMN audio_url TEXT NOT NULL DEFAULT ''", (migrationError) => {
        if (migrationError) {
          console.error('Could not add the audio_url column.', migrationError)
        }
      })
    }

    if (!columnNames.has('meaning_en')) {
      db.run("ALTER TABLE vocabularies ADD COLUMN meaning_en TEXT NOT NULL DEFAULT ''", (migrationError) => {
        if (migrationError) {
          console.error('Could not add the meaning_en column.', migrationError)
        }
      })
    }

    if (!columnNames.has('meaning_vi')) {
      db.run("ALTER TABLE vocabularies ADD COLUMN meaning_vi TEXT NOT NULL DEFAULT ''", (migrationError) => {
        if (migrationError) {
          console.error('Could not add the meaning_vi column.', migrationError)
        }
      })
    }

    if (!columnNames.has('set_id')) {
      db.run('ALTER TABLE vocabularies ADD COLUMN set_id INTEGER REFERENCES vocabulary_sets(id) ON DELETE SET NULL', (migrationError) => {
        if (migrationError) {
          console.error('Could not add the set_id column.', migrationError)
        }
      })
    }

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_vocabularies_set_id
      ON vocabularies(set_id)
    `)

    db.run(
      `
        UPDATE vocabularies
        SET meaning_en = meaning
        WHERE TRIM(meaning_en) = '' AND TRIM(meaning) != ''
      `,
      (migrationError) => {
        if (migrationError) {
          console.error('Could not migrate existing meanings to meaning_en.', migrationError)
        }
      },
    )
  })
})

export default db
