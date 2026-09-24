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
      part_of_speech TEXT,
      example TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'learning', 'learned')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
})

export default db
