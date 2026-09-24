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
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'learning', 'learned')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
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
