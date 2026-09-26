import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const levelRank = new Map(levels.map((level, index) => [level, index]))
const wordPattern = /\p{L}+(?:[’']\p{L}+)*(?:-\p{L}+(?:[’']\p{L}+)*)*/gu

function parseCsv(csvText) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]

    if (quoted) {
      if (character === '"' && csvText[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n') {
      row.push(value.replace(/\r$/u, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/u, ''))
    rows.push(row)
  }

  return rows
}

function normalizeSurface(value) {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/’/gu, "'")
    .replace(/\s+/gu, ' ')
}

function addDatasetEntry(dataset, headword, level) {
  if (!levelRank.has(level)) return

  const alternatives = [headword, ...headword.split('/')]

  for (const alternative of alternatives) {
    const normalized = normalizeSurface(alternative)
    if (!normalized) continue

    const currentLevel = dataset.get(normalized)
    if (!currentLevel || levelRank.get(level) < levelRank.get(currentLevel)) {
      dataset.set(normalized, level)
    }
  }
}

function loadDatasetFile(relativePath, dataset) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
  const headwordIndex = header.indexOf('headword')
  const levelIndex = header.indexOf('CEFR')

  if (headwordIndex === -1 || levelIndex === -1) {
    throw new Error(`CEFR dataset is missing required columns: ${relativePath}`)
  }

  for (const row of rows) {
    addDatasetEntry(dataset, row[headwordIndex] || '', row[levelIndex] || '')
  }
}

const cefrDataset = new Map()
loadDatasetFile('../data/cefr/cefrj-vocabulary-profile-1.5.csv', cefrDataset)
loadDatasetFile('../data/cefr/octanove-vocabulary-profile-c1c2-1.0.csv', cefrDataset)

function addCandidate(candidates, candidate) {
  if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
}

function lemmaCandidates(normalized) {
  const candidates = []

  if (normalized.endsWith("s'") && normalized.length > 3) {
    addCandidate(candidates, normalized.slice(0, -1))
  }

  if (normalized.endsWith('ies') && normalized.length > 4) {
    addCandidate(candidates, `${normalized.slice(0, -3)}y`)
  }

  if (normalized.endsWith('ied') && normalized.length > 4) {
    addCandidate(candidates, `${normalized.slice(0, -3)}y`)
  }

  if (normalized.endsWith('ing') && normalized.length > 5) {
    const stem = normalized.slice(0, -3)
    addCandidate(candidates, stem)
    addCandidate(candidates, `${stem}e`)
    if (/([b-df-hj-np-tv-z])\1$/u.test(stem)) addCandidate(candidates, stem.slice(0, -1))
  }

  if (normalized.endsWith('ed') && normalized.length > 4) {
    const stem = normalized.slice(0, -2)
    addCandidate(candidates, stem)
    addCandidate(candidates, `${stem}e`)
    if (/([b-df-hj-np-tv-z])\1$/u.test(stem)) addCandidate(candidates, stem.slice(0, -1))
  }

  if (normalized.endsWith('es') && normalized.length > 4) {
    addCandidate(candidates, normalized.slice(0, -2))
    addCandidate(candidates, normalized.slice(0, -1))
  }

  if (
    normalized.endsWith('s')
    && normalized.length > 3
    && !normalized.endsWith('ss')
    && !normalized.endsWith('us')
    && !normalized.endsWith('is')
  ) {
    addCandidate(candidates, normalized.slice(0, -1))
  }

  return candidates
}

export function resolveCefrWord(value) {
  const normalized = normalizeSurface(value)
  const exactLevel = cefrDataset.get(normalized)

  if (exactLevel) return { normalized, level: exactLevel }

  for (const candidate of lemmaCandidates(normalized)) {
    const level = cefrDataset.get(candidate)
    if (level) return { normalized: candidate, level }
  }

  return { normalized, level: 'Unknown' }
}

export function normalizeExistingVocabulary(value) {
  const normalized = normalizeSurface(typeof value === 'string' ? value : '')
  if (!normalized || normalized.includes(' ')) return normalized
  return resolveCefrWord(normalized).normalized
}

export function analyzeCefrText(text, existingVocabulary = new Set()) {
  const tokens = []
  const summary = Object.fromEntries([...levels, 'Unknown'].map((level) => [level, 0]))

  for (const match of text.matchAll(wordPattern)) {
    const resolved = resolveCefrWord(match[0])
    const token = {
      text: match[0],
      normalized: resolved.normalized,
      level: resolved.level,
      start: match.index,
      end: match.index + match[0].length,
      existing: existingVocabulary.has(resolved.normalized),
    }

    tokens.push(token)
    summary[token.level] += 1
  }

  return { tokens, summary }
}

export function getCefrDatasetStats() {
  return {
    entries: cefrDataset.size,
    levels: [...levels],
  }
}
