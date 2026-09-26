import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'
import { normalizeOcrVocabularyWord } from '../services/vocabularyNormalization.js'

const router = Router()
const maximumFileSize = 8 * 1024 * 1024
const maximumInputPixels = 40_000_000
const maximumOutputPixels = 50_000_000
const ocrSpaceEndpoint = 'https://api.ocr.space/parse/image'
const ocrSpaceMaximumFileSize = 1024 * 1024
const ocrSpaceTargetFileSize = 950 * 1024
const ocrSpaceTimeoutMilliseconds = 25_000
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const segmentationModes = {
  auto: PSM.AUTO,
  singleBlock: PSM.SINGLE_BLOCK,
  sparseText: PSM.SPARSE_TEXT,
}
const structuredFields = [
  'word',
  'phonetic',
  'part_of_speech',
  'meaning_vi',
  'meaning_en',
  'example',
]
const headerAliases = [
  { field: 'part_of_speech', labels: ['part of speech', 'word class', 'tu loai', 'pos'] },
  { field: 'meaning_vi', labels: ['vietnamese meaning', 'meaning vietnamese', 'nghia tieng viet', 'nghia', 'meaning'] },
  { field: 'meaning_en', labels: ['english meaning', 'meaning english', 'definition'] },
  { field: 'phonetic', labels: ['pronunciation', 'phonetic', 'phat am', 'ipa'] },
  { field: 'example', labels: ['example sentence', 'example', 'sentence'] },
  { field: 'word', labels: ['vocabulary', 'word'] },
  { field: 'ignore', labels: ['status', 'actions', 'action'] },
]

function developmentLoggingEnabled() {
  return process.env.NODE_ENV !== 'production'
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maximumFileSize,
    files: 1,
  },
  fileFilter(request, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Choose a PNG, JPG, JPEG, or WEBP image.')
      error.code = 'UNSUPPORTED_IMAGE_TYPE'
      callback(error)
      return
    }

    callback(null, true)
  },
})

export function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return ''

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  return ''
}

function normalizeOcrText(value) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim()
    : ''
}

function normalizeHeaderText(value) {
  return normalizeOcrText(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function median(values) {
  if (!values.length) return 0

  const sortedValues = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sortedValues.length / 2)
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2
}

function joinDetectedText(items) {
  return items
    .map((item) => normalizeOcrText(item.text).replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:!?%)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .trim()
}

function createEmptyStructuredRow() {
  return Object.fromEntries(structuredFields.map((field) => [field, '']))
}

function normalizeParsedVocabularyRow(row) {
  const normalizedWord = normalizeOcrVocabularyWord(row.word)
  const existingWarnings = Array.isArray(row.parser_warnings) ? row.parser_warnings : []

  return {
    ...row,
    word: normalizedWord.value,
    parser_warnings: [...new Set([...existingWarnings, ...normalizedWord.warnings])],
  }
}

function cleanMarkdownCell(value) {
  return normalizeOcrText(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\\\|/g, '|')
    .replace(/^(?:\*\*|__|`)(.*)(?:\*\*|__|`)$/s, '$1')
    .trim()
}

function headerFieldFromCell(value) {
  const normalizedValue = normalizeHeaderText(value)
  if (!normalizedValue) return ''

  const aliases = headerAliases
    .flatMap(({ field, labels }) => labels.map((label) => ({ field, label })))
    .sort((first, second) => second.label.length - first.label.length)

  return aliases.find(({ label }) =>
    normalizedValue === label ||
    normalizedValue.startsWith(`${label} `) ||
    normalizedValue.endsWith(` ${label}`),
  )?.field || ''
}

function isMarkdownSeparatorCell(value) {
  return /^:?-{3,}:?$/.test(value.trim())
}

function splitMarkdownRow(line) {
  const trimmedLine = line.trim()
  if (!trimmedLine.includes('|')) return []

  return trimmedLine
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(cleanMarkdownCell)
}

function splitTabularLine(line) {
  if (line.includes('\t')) {
    return line.split(/\t+/).map(cleanMarkdownCell)
  }

  return splitMarkdownRow(line)
}

function rowFromCells(cells, fields) {
  const row = createEmptyStructuredRow()

  fields.forEach((field, index) => {
    if (!field || field === 'ignore') return

    const value = cleanMarkdownCell(cells[index])
    if (value) row[field] = value
  })

  return extractEmbeddedPartOfSpeech(row)
}

export function parseOcrSpaceTable(text) {
  const lines = normalizeOcrText(text)
    .split('\n')
    .map((line) => line.trim())
  let headerIndex = -1
  let headerFields = []

  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitTabularLine(lines[index])
    if (cells.length < 2) continue

    const fields = cells.map(headerFieldFromCell)
    const recognizedFields = new Set(fields.filter((field) => field && field !== 'ignore'))

    if (recognizedFields.size >= 2) {
      headerIndex = index
      headerFields = fields
      break
    }
  }

  if (headerIndex < 0) return []

  const rows = []

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line) continue

    const cells = splitTabularLine(line)
    if (cells.length < 2 || cells.every(isMarkdownSeparatorCell)) continue

    const row = normalizeParsedVocabularyRow(rowFromCells(cells, headerFields))
    if (structuredFields.some((field) => row[field])) rows.push(row)
  }

  return rows
}

export async function prepareOcrSpaceImage(buffer, mimeType) {
  if (buffer.length <= ocrSpaceTargetFileSize && mimeType !== 'image/webp') {
    return {
      buffer,
      filename: mimeType === 'image/png' ? 'ocr-input.png' : 'ocr-input.jpg',
      mimeType,
    }
  }

  const metadata = await createOriginalImagePipeline(buffer).metadata()
  const originalWidth = metadata.autoOrient?.width || metadata.width
  const originalHeight = metadata.autoOrient?.height || metadata.height

  if (!originalWidth || !originalHeight) {
    throw new Error('Image dimensions are unavailable.')
  }

  let scale = 1
  let quality = 90

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(900, Math.round(originalWidth * scale))
    const height = Math.max(900, Math.round(originalHeight * scale))
    const preparedBuffer = await createOriginalImagePipeline(buffer)
      .autoOrient()
      .flatten({ background: '#ffffff' })
      .resize({
        width: Math.min(originalWidth, width),
        height: Math.min(originalHeight, height),
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ chromaSubsampling: '4:4:4', mozjpeg: true, quality })
      .toBuffer()

    if (preparedBuffer.length <= ocrSpaceTargetFileSize) {
      return { buffer: preparedBuffer, filename: 'ocr-input.jpg', mimeType: 'image/jpeg' }
    }

    const sizeRatio = Math.sqrt(ocrSpaceTargetFileSize / preparedBuffer.length) * 0.95
    scale *= Math.max(0.65, Math.min(0.88, sizeRatio))
    quality = Math.max(55, quality - 5)
  }

  throw new Error(`Image could not be prepared below ${ocrSpaceMaximumFileSize} bytes.`)
}

function ocrSpaceResponseError(data) {
  const errorMessage = Array.isArray(data?.ErrorMessage)
    ? data.ErrorMessage.join('; ')
    : normalizeOcrText(data?.ErrorMessage)
  return errorMessage || 'OCR.space could not process the image.'
}

export function parseOcrSpaceResponse(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.ParsedResults)) {
    throw new Error('OCR.space returned a malformed response.')
  }

  if (data.IsErroredOnProcessing) {
    throw new Error(ocrSpaceResponseError(data))
  }

  const successfulResults = data.ParsedResults.filter((result) =>
    result && (result.FileParseExitCode === undefined || Number(result.FileParseExitCode) === 1),
  )
  const text = normalizeOcrText(
    successfulResults.map((result) => normalizeOcrText(result.ParsedText)).filter(Boolean).join('\n'),
  )

  if (!text) {
    throw new Error('OCR.space returned no readable text.')
  }

  const rows = parseOcrSpaceTable(text)

  return {
    mode: rows.length ? 'table' : 'text',
    text,
    confidence: null,
    source: 'ocr.space',
    rows,
  }
}

export async function recognizeWithOcrSpace(buffer, mimeType) {
  const apiKey = typeof process.env.OCR_SPACE_API_KEY === 'string'
    ? process.env.OCR_SPACE_API_KEY.trim()
    : ''

  if (!apiKey) {
    throw new Error('OCR_SPACE_API_KEY is not configured.')
  }

  const preparedImage = await prepareOcrSpaceImage(buffer, mimeType)
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([preparedImage.buffer], { type: preparedImage.mimeType }),
    preparedImage.filename,
  )
  formData.append('OCREngine', '3')
  formData.append('language', 'auto')
  formData.append('isTable', 'true')
  formData.append('detectOrientation', 'true')
  formData.append('scale', 'true')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ocrSpaceTimeoutMilliseconds)

  try {
    const providerResponse = await fetch(ocrSpaceEndpoint, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: formData,
      signal: controller.signal,
    })

    if (!providerResponse.ok) {
      throw new Error(`OCR.space returned HTTP ${providerResponse.status}.`)
    }

    let data

    try {
      data = await providerResponse.json()
    } catch {
      throw new Error('OCR.space returned invalid JSON.')
    }

    return parseOcrSpaceResponse(data)
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`OCR.space timed out after ${ocrSpaceTimeoutMilliseconds}ms.`)
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function extractOcrWords(blocks) {
  if (!Array.isArray(blocks)) return []

  const words = []

  for (const block of blocks) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
          const text = normalizeOcrText(word.text).replace(/\s+/g, ' ')
          const bbox = word.bbox

          if (
            text &&
            bbox &&
            [bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite) &&
            bbox.x1 > bbox.x0 &&
            bbox.y1 > bbox.y0
          ) {
            words.push({
              bbox: { x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 },
              confidence: Number(word.confidence) || 0,
              text,
            })
          }
        }
      }
    }
  }

  return words
}

export function groupWordsIntoRows(words) {
  const validWords = words
    .filter((word) => word?.text && word?.bbox)
    .map((word) => ({
      ...word,
      centerY: (word.bbox.y0 + word.bbox.y1) / 2,
      height: word.bbox.y1 - word.bbox.y0,
    }))
    .sort((first, second) => first.centerY - second.centerY || first.bbox.x0 - second.bbox.x0)

  if (!validWords.length) return []

  const yTolerance = Math.max(6, median(validWords.map((word) => word.height)) * 0.6)
  const rows = []

  for (const word of validWords) {
    let bestRow = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const row of rows) {
      const overlap = Math.max(
        0,
        Math.min(row.bbox.y1, word.bbox.y1) - Math.max(row.bbox.y0, word.bbox.y0),
      )
      const overlapRatio = overlap / Math.max(1, Math.min(row.height, word.height))
      const distance = Math.abs(row.centerY - word.centerY)

      if ((distance <= yTolerance || overlapRatio >= 0.35) && distance < bestDistance) {
        bestRow = row
        bestDistance = distance
      }
    }

    if (!bestRow) {
      rows.push({
        bbox: { ...word.bbox },
        centerY: word.centerY,
        height: word.height,
        words: [word],
      })
      continue
    }

    bestRow.words.push(word)
    bestRow.bbox.x0 = Math.min(bestRow.bbox.x0, word.bbox.x0)
    bestRow.bbox.y0 = Math.min(bestRow.bbox.y0, word.bbox.y0)
    bestRow.bbox.x1 = Math.max(bestRow.bbox.x1, word.bbox.x1)
    bestRow.bbox.y1 = Math.max(bestRow.bbox.y1, word.bbox.y1)
    bestRow.centerY = bestRow.words.reduce((sum, item) => sum + item.centerY, 0) / bestRow.words.length
    bestRow.height = bestRow.bbox.y1 - bestRow.bbox.y0
  }

  return rows
    .map((row) => ({
      ...row,
      text: joinDetectedText(row.words.sort((first, second) => first.bbox.x0 - second.bbox.x0)),
    }))
    .sort((first, second) => first.centerY - second.centerY)
}

function segmentRow(row, pageWidth) {
  if (!row.words.length) return []

  const words = [...row.words].sort((first, second) => first.bbox.x0 - second.bbox.x0)
  const medianHeight = median(words.map((word) => word.height || word.bbox.y1 - word.bbox.y0))
  const gapThreshold = Math.max(18, medianHeight * 1.5, pageWidth * 0.018)
  const segments = []
  let currentWords = []

  for (const word of words) {
    const previousWord = currentWords[currentWords.length - 1]

    if (previousWord && word.bbox.x0 - previousWord.bbox.x1 > gapThreshold) {
      segments.push(currentWords)
      currentWords = []
    }

    currentWords.push(word)
  }

  if (currentWords.length) segments.push(currentWords)

  return segments.map((items) => ({
    bbox: {
      x0: Math.min(...items.map((item) => item.bbox.x0)),
      y0: Math.min(...items.map((item) => item.bbox.y0)),
      x1: Math.max(...items.map((item) => item.bbox.x1)),
      y1: Math.max(...items.map((item) => item.bbox.y1)),
    },
    centerX: (
      Math.min(...items.map((item) => item.bbox.x0)) +
      Math.max(...items.map((item) => item.bbox.x1))
    ) / 2,
    text: joinDetectedText(items),
    words: items,
  }))
}

function detectHeadersInRow(row) {
  const words = row.words
  const candidates = []

  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= Math.min(4, words.length - start); length += 1) {
      const slice = words.slice(start, start + length)
      const normalizedText = normalizeHeaderText(slice.map((word) => word.text).join(' '))

      for (const definition of headerAliases) {
        if (definition.labels.includes(normalizedText)) {
          candidates.push({
            end: start + length - 1,
            field: definition.field,
            length,
            start,
            text: joinDetectedText(slice),
            x: (slice[0].bbox.x0 + slice[slice.length - 1].bbox.x1) / 2,
          })
        }
      }
    }
  }

  const selected = []
  const occupiedWordIndexes = new Set()

  for (const candidate of candidates.sort((first, second) => second.length - first.length)) {
    const indexes = Array.from(
      { length: candidate.end - candidate.start + 1 },
      (_, index) => candidate.start + index,
    )

    if (indexes.some((index) => occupiedWordIndexes.has(index))) continue
    indexes.forEach((index) => occupiedWordIndexes.add(index))
    selected.push(candidate)
  }

  return selected.sort((first, second) => first.x - second.x)
}

function findHeaderRow(rows) {
  let bestHeader = null

  rows.forEach((row, index) => {
    const headers = detectHeadersInRow(row)
    const recognizedFields = new Set(
      headers.filter((header) => header.field !== 'ignore').map((header) => header.field),
    )

    if (recognizedFields.size < 2) return

    const score = recognizedFields.size * 3 + headers.length
    if (!bestHeader || score > bestHeader.score) {
      bestHeader = { headers, index, row, score }
    }
  })

  return bestHeader
}

function clusterHorizontalPositions(items, tolerance) {
  const clusters = []

  for (const item of [...items].sort((first, second) => first.x - second.x)) {
    let cluster = clusters.find((candidate) => Math.abs(candidate.x - item.x) <= tolerance)

    if (!cluster) {
      cluster = { items: [], rowIndexes: new Set(), x: item.x }
      clusters.push(cluster)
    }

    cluster.items.push(item)
    cluster.rowIndexes.add(item.rowIndex)
    cluster.x = cluster.items.reduce((sum, value) => sum + value.x, 0) / cluster.items.length
  }

  return clusters
}

function getProcessedWidth(metadata) {
  return Math.max(1, (metadata.width || 1) * (metadata.scale || 1))
}

export function detectTableLikeLayout(words, metadata = {}) {
  const rows = groupWordsIntoRows(words)
  if (rows.length < 4) return false

  const pageWidth = getProcessedWidth(metadata)
  const segmentedRows = rows.map((row) => segmentRow(row, pageWidth))
  const medianHeight = median(words.map((word) => word.bbox.y1 - word.bbox.y0))
  const clusters = clusterHorizontalPositions(
    segmentedRows.flatMap((segments, rowIndex) =>
      segments.map((segment) => ({ rowIndex, x: segment.bbox.x0 })),
    ),
    Math.max(24, medianHeight * 2, pageWidth * 0.035),
  )
  const repeatedColumns = clusters.filter((cluster) => cluster.rowIndexes.size >= 3).length
  const multiColumnRows = segmentedRows.filter((segments) => segments.length >= 2).length
  const shortRows = rows.filter((row) => row.words.length <= 12).length
  const hasHeaders = rows.some((row) => {
    const fields = new Set(
      detectHeadersInRow(row)
        .filter((header) => header.field !== 'ignore')
        .map((header) => header.field),
    )
    return fields.size >= 2
  })
  let score = 0

  if (hasHeaders) score += 2
  if (multiColumnRows >= 3 && multiColumnRows / rows.length >= 0.35) score += 2
  if (repeatedColumns >= 2) score += 2
  if (rows.length >= 5 && shortRows / rows.length >= 0.65) score += 1
  if ((metadata.aspectRatio || 1) >= 1.2) score += 1

  return score >= 4
}

function calculateUpscaleFactor(width, height) {
  if (!width || !height) return 1

  const preferredFactor = width < 1000 ? 3 : 2
  const maximumSafeFactor = Math.sqrt(maximumOutputPixels / (width * height))
  return Math.max(1, Math.min(preferredFactor, maximumSafeFactor))
}

function createOriginalImagePipeline(buffer) {
  return sharp(buffer, {
    failOn: 'error',
    limitInputPixels: maximumInputPixels,
    sequentialRead: true,
  })
}

export async function createPreprocessingVariants(buffer) {
  const metadata = await createOriginalImagePipeline(buffer).metadata()
  const width = metadata.autoOrient?.width || metadata.width
  const height = metadata.autoOrient?.height || metadata.height
  const scale = calculateUpscaleFactor(width, height)
  const resizedWidth = width ? Math.round(width * scale) : null
  let basePipeline = createOriginalImagePipeline(buffer)
    .autoOrient()
    .flatten({ background: '#ffffff' })

  if (resizedWidth && scale > 1) {
    basePipeline = basePipeline.resize({
      width: resizedWidth,
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
  }

  const grayscaleBase = await basePipeline
    .grayscale()
    .png({ compressionLevel: 3 })
    .toBuffer()
  const statistics = await sharp(grayscaleBase).stats()
  const meanLuminance = statistics.channels[0]?.mean ?? 255

  const variantA = await sharp(grayscaleBase)
    .normalize({ lower: 1, upper: 99 })
    .sharpen({ sigma: 1.2 })
    .png({ compressionLevel: 6 })
    .toBuffer()

  let variantBPipeline = sharp(grayscaleBase)

  if (meanLuminance < 110) {
    variantBPipeline = variantBPipeline.negate()
  }

  const variantB = await variantBPipeline
    .normalize({ lower: 2, upper: 98 })
    .linear(1.2, -20)
    .threshold(175)
    .png({ compressionLevel: 6 })
    .toBuffer()

  const variantC = await sharp(grayscaleBase)
    .linear(1.1, -10)
    .sharpen({ sigma: 0.7 })
    .png({ compressionLevel: 6 })
    .toBuffer()

  return {
    metadata: {
      aspectRatio: width && height ? width / height : 1,
      height,
      scale,
      width,
    },
    variants: [
      { id: 'variant_a', buffer: variantA },
      { id: 'variant_b', buffer: variantB },
      { id: 'variant_c', buffer: variantC },
    ],
  }
}

export async function preprocessImage(buffer) {
  const { variants } = await createPreprocessingVariants(buffer)
  return variants[0].buffer
}

export function detectTableLikeText(text, metadata = {}) {
  const lines = normalizeOcrText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const normalizedText = lines.join(' ').toLowerCase()
  const headerTerms = [
    'word',
    'meaning',
    'pronunciation',
    'phonetic',
    'part of speech',
    'example',
    'nghĩa',
    'phát âm',
    'từ loại',
  ]
  const headerMatches = headerTerms.filter((term) => normalizedText.includes(term)).length
  const alignedRows = lines.filter((line) => /\S[ \t]{2,}\S/.test(line)).length
  const hasSeveralRows = lines.length >= 5
  const hasWideLayout = (metadata.aspectRatio || 1) >= 1.2

  return (
    (hasSeveralRows && headerMatches >= 2) ||
    (hasSeveralRows && alignedRows >= 3) ||
    (hasWideLayout && headerMatches >= 1 && alignedRows >= 1)
  )
}

function appendFieldValue(row, field, value) {
  const cleanValue = normalizeOcrText(value).replace(/\s+/g, ' ')
  if (!cleanValue || field === 'ignore') return

  row[field] = row[field] ? `${row[field]} ${cleanValue}` : cleanValue
}

const normalizedPartOfSpeechMarkers = {
  n: 'noun',
  noun: 'noun',
  v: 'verb',
  verb: 'verb',
  ad: 'adjective',
  adj: 'adjective',
  adjective: 'adjective',
  adv: 'adverb',
  adverb: 'adverb',
  prep: 'preposition',
  preposition: 'preposition',
  pron: 'pronoun',
  pronoun: 'pronoun',
  conj: 'conjunction',
  conjunction: 'conjunction',
  interj: 'interjection',
  interjection: 'interjection',
  determiner: 'determiner',
  article: 'article',
}

function normalizePartOfSpeechMarker(value) {
  return normalizedPartOfSpeechMarkers[normalizeOcrText(value).replace(/\.$/, '').toLowerCase()] || ''
}

export function extractEmbeddedPartOfSpeech(row) {
  const posExpression = '(?:adjective|adverb|preposition|pronoun|conjunction|interjection|determiner|article|adj|adv|prep|pron|conj|interj|noun|verb|ad|n|v)'
  const leadingPhoneticMatch = row.phonetic.match(new RegExp(`^(\\(${posExpression}\\.?\\))\\s+(.+)$`, 'i'))

  if (leadingPhoneticMatch) {
    const marker = leadingPhoneticMatch[1].slice(1, -1)

    return {
      ...row,
      part_of_speech: row.part_of_speech || normalizePartOfSpeechMarker(marker),
      phonetic: leadingPhoneticMatch[2].trim(),
    }
  }

  if (!row.word) return row

  const match = row.word.match(
    new RegExp(`^(.*?)\\s*\\((${posExpression})\\.?(\\))?$`, 'i'),
  )

  if (!match || !match[1].trim()) return row

  const warning = match[3]
    ? 'Moved trailing OCR part-of-speech marker into Part of Speech.'
    : 'Repaired incomplete trailing OCR part-of-speech marker.'
  const existingWarnings = Array.isArray(row.parser_warnings) ? row.parser_warnings : []

  return {
    ...row,
    part_of_speech: row.part_of_speech || normalizePartOfSpeechMarker(match[2]),
    parser_warnings: [...new Set([...existingWarnings, warning])],
    word: match[1].trim(),
  }
}

function mapRowsUsingHeaders(rows, headerInfo) {
  const columns = [...headerInfo.headers].sort((first, second) => first.x - second.x)
  const dataRows = rows.filter((row) => row.centerY > headerInfo.row.bbox.y1)

  return dataRows
    .map((row) => {
      const structuredRow = createEmptyStructuredRow()

      for (const word of row.words) {
        const centerX = (word.bbox.x0 + word.bbox.x1) / 2
        let nearestColumn = columns[0]
        let nearestDistance = Math.abs(centerX - nearestColumn.x)

        for (const column of columns.slice(1)) {
          const distance = Math.abs(centerX - column.x)
          if (distance < nearestDistance) {
            nearestColumn = column
            nearestDistance = distance
          }
        }

        appendFieldValue(structuredRow, nearestColumn.field, word.text)
      }

      return extractEmbeddedPartOfSpeech(structuredRow)
    })
    .filter((row) => structuredFields.some((field) => row[field]))
}

function looksLikePhonetic(value) {
  const text = normalizeOcrText(value)
  return (
    (/^[/\[].*[/\]]$/.test(text) && text.length >= 3) ||
    /[ˈˌəɪʊʌɒæθðŋʃʒɔɑɛɜɡ]/u.test(text)
  )
}

function looksLikePartOfSpeech(value) {
  const normalized = normalizeHeaderText(value).replace(/\bof\b/g, '').replace(/\s+/g, ' ').trim()
  return /^(adj|adjective|adv|adverb|n|noun|v|verb|prep|preposition|pron|pronoun|conj|conjunction|interj|interjection|determiner|article)$/.test(normalized)
}

function containsVietnamese(value) {
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(value)
}

function inferColumnDefinitions(rows, metadata) {
  const pageWidth = getProcessedWidth(metadata)
  const segmentedRows = rows.map((row, rowIndex) => ({
    rowIndex,
    segments: segmentRow(row, pageWidth),
  }))
  const allSegments = segmentedRows.flatMap(({ rowIndex, segments }) =>
    segments.map((segment) => ({ ...segment, rowIndex, x: segment.bbox.x0 })),
  )
  const medianHeight = median(
    rows.flatMap((row) => row.words.map((word) => word.bbox.y1 - word.bbox.y0)),
  )
  const minimumSupport = Math.max(2, Math.ceil(rows.length * 0.25))
  const clusters = clusterHorizontalPositions(
    allSegments,
    Math.max(24, medianHeight * 2, pageWidth * 0.035),
  )
    .filter((cluster) => cluster.rowIndexes.size >= minimumSupport)
    .sort((first, second) => first.x - second.x)
    .slice(0, 6)

  if (clusters.length < 2) return { columns: [], segmentedRows }

  const columns = clusters.map((cluster, index) => {
    const texts = cluster.items.map((item) => item.text)
    return {
      field: '',
      index,
      phoneticScore: texts.filter(looksLikePhonetic).length / texts.length,
      posScore: texts.filter(looksLikePartOfSpeech).length / texts.length,
      sentenceScore: texts.filter((text) => text.split(/\s+/).length >= 5).length / texts.length,
      vietnameseScore: texts.filter(containsVietnamese).length / texts.length,
      x: cluster.x,
    }
  })
  const availableColumns = new Set(columns.map((column) => column.index))

  const assignStrongestColumn = (scoreName, field, minimumScore) => {
    const candidate = columns
      .filter((column) => availableColumns.has(column.index))
      .sort((first, second) => second[scoreName] - first[scoreName])[0]

    if (!candidate || candidate[scoreName] < minimumScore) return
    candidate.field = field
    availableColumns.delete(candidate.index)
  }

  assignStrongestColumn('phoneticScore', 'phonetic', 0.3)
  assignStrongestColumn('posScore', 'part_of_speech', 0.3)

  const wordColumn = columns.find((column) => availableColumns.has(column.index))
  if (wordColumn) {
    wordColumn.field = 'word'
    availableColumns.delete(wordColumn.index)
  }

  const remainingColumns = columns.filter((column) => availableColumns.has(column.index))
  const vietnameseColumn = [...remainingColumns]
    .sort((first, second) => second.vietnameseScore - first.vietnameseScore)[0]

  if (vietnameseColumn && vietnameseColumn.vietnameseScore > 0) {
    vietnameseColumn.field = 'meaning_vi'
    availableColumns.delete(vietnameseColumn.index)
  }

  const sentenceColumn = columns
    .filter((column) => availableColumns.has(column.index))
    .sort((first, second) => second.sentenceScore - first.sentenceScore)[0]

  if (sentenceColumn && sentenceColumn.sentenceScore >= 0.5 && availableColumns.size > 1) {
    sentenceColumn.field = 'example'
    availableColumns.delete(sentenceColumn.index)
  }

  for (const column of columns.filter((item) => availableColumns.has(item.index))) {
    if (!columns.some((item) => item.field === 'meaning_vi')) {
      column.field = 'meaning_vi'
    } else if (!columns.some((item) => item.field === 'meaning_en')) {
      column.field = 'meaning_en'
    } else if (!columns.some((item) => item.field === 'example')) {
      column.field = 'example'
    } else {
      column.field = 'meaning_vi'
    }
  }

  return { columns, segmentedRows }
}

function mapRowsUsingInferredColumns(rows, metadata) {
  const { columns, segmentedRows } = inferColumnDefinitions(rows, metadata)
  if (!columns.length) return []

  return segmentedRows
    .map(({ segments }) => {
      const structuredRow = createEmptyStructuredRow()

      for (const segment of segments) {
        const nearestColumn = columns.reduce((nearest, column) =>
          Math.abs(segment.bbox.x0 - column.x) < Math.abs(segment.bbox.x0 - nearest.x)
            ? column
            : nearest,
        columns[0])
        appendFieldValue(structuredRow, nearestColumn.field, segment.text)
      }

      return extractEmbeddedPartOfSpeech(structuredRow)
    })
    .filter((row) => structuredFields.some((field) => row[field]))
}

export function parseVocabularyRows(words, metadata = {}) {
  const groupedRows = groupWordsIntoRows(words)
  const headerInfo = findHeaderRow(groupedRows)
  const rows = headerInfo
    ? mapRowsUsingHeaders(groupedRows, headerInfo)
    : mapRowsUsingInferredColumns(groupedRows, metadata)

  return rows
    .map(normalizeParsedVocabularyRow)
    .filter((row) => structuredFields.some((field) => row[field]))
}

function logOcrAttempt(attempt) {
  if (!developmentLoggingEnabled()) return

  console.info(
    `[ocr] variant=${attempt.variant} mode=${attempt.mode} confidence=${attempt.confidence.toFixed(1)} characters=${attempt.text.length} boxes=${attempt.layoutWords.length}`,
  )
}

function isBetterAttempt(candidate, currentBest) {
  if (!currentBest) return true
  if (candidate.confidence !== currentBest.confidence) {
    return candidate.confidence > currentBest.confidence
  }

  const candidateCharacters = candidate.text.replace(/\s/g, '').length
  const currentCharacters = currentBest.text.replace(/\s/g, '').length
  return candidateCharacters > currentCharacters
}

async function recognizeAttempt(worker, variant, mode) {
  await worker.setParameters({
    tessedit_pageseg_mode: mode.value,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })

  const { data } = await worker.recognize(variant.buffer, {}, { text: true, blocks: true })
  const attempt = {
    confidence: Number(data.confidence) || 0,
    layoutWords: extractOcrWords(data.blocks),
    mode: mode.id,
    text: normalizeOcrText(data.text),
    variant: variant.id,
  }

  logOcrAttempt(attempt)
  return attempt
}

export async function recognizeBestText(worker, preprocessing) {
  const variantsById = Object.fromEntries(
    preprocessing.variants.map((variant) => [variant.id, variant]),
  )
  const corePlans = [
    ['variant_a', 'singleBlock'],
    ['variant_b', 'singleBlock'],
    ['variant_c', 'singleBlock'],
    ['variant_c', 'auto'],
  ]
  const attempts = []
  let bestResult = null

  const runPlans = async (plans) => {
    for (const [variantId, modeId] of plans) {
      const variant = variantsById[variantId]
      const mode = { id: modeId, value: segmentationModes[modeId] }
      try {
        const attempt = await recognizeAttempt(worker, variant, mode)
        attempts.push(attempt)

        if (isBetterAttempt(attempt, bestResult)) {
          bestResult = attempt
        }
      } catch {
        if (developmentLoggingEnabled()) {
          console.warn(`[ocr] attempt failed variant=${variantId} mode=${modeId}`)
        }
      }
    }
  }

  await runPlans(corePlans)

  const tableLike = attempts.some((attempt) =>
    detectTableLikeText(attempt.text, preprocessing.metadata) ||
    detectTableLikeLayout(attempt.layoutWords, preprocessing.metadata),
  )

  if (tableLike) {
    await runPlans([
      ['variant_a', 'sparseText'],
      ['variant_b', 'sparseText'],
      ['variant_c', 'sparseText'],
      ['variant_a', 'auto'],
    ])
  } else {
    await runPlans([['variant_a', 'auto']])
  }

  if (!bestResult) {
    throw new Error('Every OCR attempt failed.')
  }

  if (developmentLoggingEnabled()) {
    console.info(
      `[ocr] selected variant=${bestResult.variant} mode=${bestResult.mode} confidence=${bestResult.confidence.toFixed(1)} tableLike=${tableLike}`,
    )
  }

  return { ...bestResult, tableLike }
}

async function recognizeWithTesseract(buffer) {
  let worker
  let preprocessing

  try {
    preprocessing = await createPreprocessingVariants(buffer)
  } catch (error) {
    throw new Error(`Tesseract preprocessing failed: ${error.message}`)
  }

  try {
    worker = await createWorker(['eng', 'vie'])
    const result = await recognizeBestText(worker, preprocessing)
    const text = normalizeOcrText(result.text)

    if (!text) {
      throw new Error('Tesseract returned no readable text.')
    }

    const mode = result.tableLike ? 'table' : 'text'

    return {
      mode,
      text,
      confidence: Math.min(100, Math.max(0, Math.round(Number(result.confidence) || 0))),
      source: 'tesseract',
      rows: mode === 'table' ? parseVocabularyRows(result.layoutWords, preprocessing.metadata) : [],
    }
  } finally {
    if (worker) {
      try {
        await worker.terminate()
      } catch (error) {
        console.warn(`[ocr] worker cleanup failed: ${error.message}`)
      }
    }
  }
}

function uploadImage(request, response) {
  return new Promise((resolve, reject) => {
    upload.single('image')(request, response, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function sendUploadError(response, error) {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: 'The image is too large. Choose an image up to 8 MB.' })
  }

  if (error.code === 'UNSUPPORTED_IMAGE_TYPE') {
    return response.status(415).json({ error: error.message })
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return response.status(400).json({ error: 'Upload one image using the “image” field.' })
  }

  console.error(`[ocr] upload failed: ${error.message}`)
  return response.status(400).json({ error: 'The image upload could not be processed.' })
}

router.post('/ocr', async (request, response) => {
  try {
    await uploadImage(request, response)
  } catch (error) {
    return sendUploadError(response, error)
  }

  if (!request.file) {
    return response.status(400).json({ error: 'Choose an image to extract text from.' })
  }

  const detectedMimeType = detectImageMimeType(request.file.buffer)

  if (!detectedMimeType || detectedMimeType !== request.file.mimetype) {
    return response.status(415).json({ error: 'The uploaded file is not a valid PNG, JPG, JPEG, or WEBP image.' })
  }

  try {
    const result = await recognizeWithOcrSpace(request.file.buffer, detectedMimeType)

    if (developmentLoggingEnabled()) {
      console.info(`[ocr] selected provider=ocr.space mode=${result.mode} rows=${result.rows.length}`)
    }

    return response.json(result)
  } catch (error) {
    console.warn(`[ocr] OCR.space unavailable; using Tesseract fallback: ${error.message}`)
  }

  try {
    const result = await recognizeWithTesseract(request.file.buffer)

    if (developmentLoggingEnabled()) {
      console.info(`[ocr] selected provider=tesseract mode=${result.mode} rows=${result.rows.length}`)
    }

    return response.json(result)
  } catch (error) {
    console.error(`[ocr] OCR.space and Tesseract failed: ${error.message}`)
    return response.status(503).json({ error: 'Text extraction is unavailable. Please try again later.' })
  }
})

export default router
