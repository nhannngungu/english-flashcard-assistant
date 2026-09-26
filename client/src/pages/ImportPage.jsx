import { useEffect, useRef, useState } from 'react'
import { analyzeCefrText } from '../api/analysis.js'
import { extractTextFromImage } from '../api/imports.js'
import { lookupDictionary, normalizeVocabularyLookup } from '../api/vocabularies.js'
import CefrAnalysisPanel from '../components/CefrAnalysisPanel.jsx'
import { runWithConcurrency } from '../utils/bulkImport.js'

const maximumImageSize = 8 * 1024 * 1024
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const structuredRowFields = [
  'word',
  'phonetic',
  'part_of_speech',
  'meaning_vi',
  'meaning_en',
  'example',
]
const enrichableRowFields = structuredRowFields.filter((field) => field !== 'word')
const structuredFieldLabels = {
  word: 'Word',
  phonetic: 'Phonetic',
  part_of_speech: 'Part of Speech',
  meaning_vi: 'Vietnamese Meaning',
  meaning_en: 'English Meaning',
  example: 'Example',
}
let nextStructuredRowId = 0

function normalizeStructuredRow(row = {}) {
  nextStructuredRowId += 1

  return {
    id: `ocr-row-${nextStructuredRowId}`,
    ...Object.fromEntries(
      structuredRowFields.map((field) => [field, typeof row[field] === 'string' ? row[field] : '']),
    ),
    enrichment_status: 'idle',
    enrichment_error: '',
    enrichment_notice: '',
    filled_fields: [],
    parser_warnings: Array.isArray(row.parser_warnings) ? row.parser_warnings : [],
  }
}

function getMissingRowFields(row) {
  return structuredRowFields.filter((field) => !row[field].trim())
}

function enrichmentErrorMessage(error) {
  if (error.status === 404) {
    return 'No dictionary entry was found. Check the OCR word, correct it if needed, and retry.'
  }

  if (error.status === 400) {
    return error.message
  }

  return 'Dictionary lookup failed. Your existing values are unchanged. Please retry.'
}

function countWords(text) {
  const trimmedText = text.trim()
  return trimmedText ? trimmedText.split(/\s+/).length : 0
}

function CompletedStep({ summary, title, onEdit }) {
  return (
    <div className="import-step-summary">
      <span className="import-step-complete" aria-hidden="true">✓</span>
      <div>
        <h3>{title}</h3>
        <p>{summary}</p>
      </div>
      <button className="subtle-button" onClick={onEdit} type="button">Edit</button>
    </div>
  )
}

function ImportPage({ onVocabularyCreated }) {
  const [mode, setMode] = useState('text')
  const [pastedText, setPastedText] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [reviewedText, setReviewedText] = useState('')
  const [previewSource, setPreviewSource] = useState('')
  const [previewMode, setPreviewMode] = useState('text')
  const [structuredRows, setStructuredRows] = useState([])
  const [isBulkEnriching, setIsBulkEnriching] = useState(false)
  const [ocrConfidence, setOcrConfidence] = useState(null)
  const [ocrSource, setOcrSource] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [cefrAnalysis, setCefrAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')
  const [inputExpanded, setInputExpanded] = useState(true)
  const [previewExpanded, setPreviewExpanded] = useState(true)
  const [continueExpanded, setContinueExpanded] = useState(true)
  const fileInputRef = useRef(null)
  const activeEnrichmentIds = useRef(new Set())

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  function resetCefrAnalysis() {
    setIsReady(false)
    setCefrAnalysis(null)
    setAnalysisError('')
  }

  function clearSharedPreview(source) {
    if (previewSource !== source) return

    setReviewedText('')
    setPreviewSource('')
    setPreviewMode('text')
    setStructuredRows([])
    setOcrConfidence(null)
    setOcrSource('')
    setShowPreview(false)
    setInputExpanded(true)
    setPreviewExpanded(true)
    setContinueExpanded(true)
    resetCefrAnalysis()
  }

  function handleClearText() {
    setPastedText('')
    clearSharedPreview('text')
  }

  function handleAnalyzeText() {
    if (!pastedText.trim()) return

    setReviewedText(pastedText)
    setPreviewSource('text')
    setPreviewMode('text')
    setStructuredRows([])
    setOcrConfidence(null)
    setOcrSource('')
    setShowPreview(true)
    setInputExpanded(false)
    setPreviewExpanded(true)
    setContinueExpanded(true)
    resetCefrAnalysis()
  }

  function handleImageChange(event) {
    const [file] = event.target.files
    setValidationError('')

    if (!file) return

    if (!supportedImageTypes.has(file.type)) {
      setValidationError('Choose a PNG, JPG, JPEG, or WEBP image.')
      event.target.value = ''
      return
    }

    if (file.size > maximumImageSize) {
      setValidationError('The image is too large. Choose an image up to 8 MB.')
      event.target.value = ''
      return
    }

    setSelectedImage(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  function handleRemoveImage() {
    setSelectedImage(null)
    setImagePreviewUrl('')
    setValidationError('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleExtractText() {
    if (!selectedImage) return

    setIsExtracting(true)
    setValidationError('')
    resetCefrAnalysis()

    try {
      const result = await extractTextFromImage(selectedImage)
      setReviewedText(result.text)
      setPreviewSource('ocr')
      setPreviewMode(result.mode === 'table' ? 'table' : 'text')
      setStructuredRows(
        result.mode === 'table' && Array.isArray(result.rows)
          ? result.rows.map(normalizeStructuredRow)
          : [],
      )
      setOcrConfidence(Number.isFinite(result.confidence) ? result.confidence : null)
      setOcrSource(result.source || '')
    setShowPreview(true)
    setInputExpanded(false)
    setPreviewExpanded(true)
    setContinueExpanded(true)
    } catch (error) {
      setValidationError(error.message)
    } finally {
      setIsExtracting(false)
    }
  }

  function handleReviewedTextChange(event) {
    setReviewedText(event.target.value)
    setPreviewExpanded(true)
    setContinueExpanded(true)
    resetCefrAnalysis()
  }

  function handleStructuredRowChange(rowIndex, field, value) {
    setStructuredRows((currentRows) => currentRows.map((row, index) =>
      index === rowIndex
        ? {
            ...row,
            [field]: value,
            enrichment_status: row.enrichment_status === 'enriching' ? 'enriching' : 'idle',
            enrichment_error: '',
            enrichment_notice: '',
            filled_fields: row.filled_fields.filter((filledField) => filledField !== field),
          }
        : row,
    ))
    resetCefrAnalysis()
  }

  async function enrichRow(row) {
    if (activeEnrichmentIds.current.has(row.id) || getMissingRowFields(row).length === 0) return

    const lookupWord = normalizeVocabularyLookup(row.word)
    activeEnrichmentIds.current.add(row.id)
    setStructuredRows((currentRows) => currentRows.map((currentRow) =>
      currentRow.id === row.id
        ? {
            ...currentRow,
            word: normalizeVocabularyLookup(currentRow.word),
            enrichment_status: 'enriching',
            enrichment_error: '',
            enrichment_notice: '',
          }
        : currentRow,
    ))

    if (!lookupWord) {
      setStructuredRows((currentRows) => currentRows.map((currentRow) =>
        currentRow.id === row.id
          ? {
              ...currentRow,
              enrichment_status: 'failed',
              enrichment_error: 'Enter or correct the word before trying to fill its missing fields.',
            }
          : currentRow,
      ))
      activeEnrichmentIds.current.delete(row.id)
      return
    }

    try {
      const enrichment = await lookupDictionary(lookupWord)

      setStructuredRows((currentRows) => currentRows.map((currentRow) => {
        if (currentRow.id !== row.id) return currentRow

        // A word edit makes this response stale. Never apply data for the old lookup word.
        if (normalizeVocabularyLookup(currentRow.word) !== lookupWord) {
          return { ...currentRow, enrichment_status: 'idle', enrichment_error: '' }
        }

        if (getMissingRowFields(currentRow).length === 0) {
          return { ...currentRow, enrichment_status: 'idle', enrichment_error: '' }
        }

        const updates = {}
        const newlyFilledFields = []

        for (const field of enrichableRowFields) {
          const returnedValue = typeof enrichment[field] === 'string' ? enrichment[field] : ''

          if (!currentRow[field].trim() && returnedValue.trim()) {
            updates[field] = returnedValue
            newlyFilledFields.push(field)
          }
        }

        const unavailableFields = Array.isArray(enrichment.unavailable_fields)
          ? enrichment.unavailable_fields
          : []
        const remainingMissingFields = enrichableRowFields.filter((field) =>
          !(typeof updates[field] === 'string' ? updates[field] : currentRow[field]).trim(),
        )
        const enrichmentNotice = remainingMissingFields.includes('example') && unavailableFields.includes('example')
          ? 'No example sentence was available from the current dictionary providers.'
          : ''

        if (newlyFilledFields.length === 0) {
          if (enrichmentNotice) {
            return {
              ...currentRow,
              enrichment_status: 'enriched',
              enrichment_error: '',
              enrichment_notice: enrichmentNotice,
            }
          }

          return {
            ...currentRow,
            enrichment_status: 'failed',
            enrichment_error: 'The lookup succeeded, but it did not provide any of this row’s missing fields.',
            enrichment_notice: '',
          }
        }

        return {
          ...currentRow,
          ...updates,
          enrichment_status: 'enriched',
          enrichment_error: '',
          enrichment_notice: enrichmentNotice,
          filled_fields: [...new Set([...currentRow.filled_fields, ...newlyFilledFields])],
        }
      }))
    } catch (error) {
      setStructuredRows((currentRows) => currentRows.map((currentRow) =>
        currentRow.id === row.id
          ? normalizeVocabularyLookup(currentRow.word) === lookupWord
            ? {
              ...currentRow,
              enrichment_status: 'failed',
              enrichment_error: enrichmentErrorMessage(error),
              enrichment_notice: '',
            }
            : { ...currentRow, enrichment_status: 'idle', enrichment_error: '' }
          : currentRow,
      ))
    } finally {
      activeEnrichmentIds.current.delete(row.id)
    }
  }

  async function handleFillAllMissing() {
    const rowsToEnrich = structuredRows.filter((row) => getMissingRowFields(row).length > 0)
    if (!rowsToEnrich.length || isBulkEnriching || activeEnrichmentIds.current.size > 0) return

    setIsBulkEnriching(true)
    setIsReady(false)

    try {
      await runWithConcurrency(rowsToEnrich, enrichRow, 3)
    } finally {
      setIsBulkEnriching(false)
    }
  }

  async function handleContinue() {
    const hasStructuredContent = structuredRows.some((row) =>
      structuredRowFields.some((field) => row[field].trim()),
    )

    if (previewMode === 'table' ? !hasStructuredContent && !reviewedText.trim() : !reviewedText.trim()) return

    if (previewMode === 'table') {
      setAnalysisError('')
      setCefrAnalysis(null)
      setIsReady(true)
      setInputExpanded(false)
      setPreviewExpanded(false)
      setContinueExpanded(false)
      return
    }

    setIsAnalyzing(true)
    setAnalysisError('')
    setCefrAnalysis(null)
    setIsReady(false)

    try {
      const result = await analyzeCefrText(reviewedText)
      setCefrAnalysis(result)
      setIsReady(true)
      setInputExpanded(false)
      setPreviewExpanded(false)
      setContinueExpanded(false)
    } catch (error) {
      setAnalysisError(error.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const hasStructuredContent = structuredRows.some((row) =>
    structuredRowFields.some((field) => row[field].trim()),
  )
  const canContinue = previewMode === 'table'
    ? hasStructuredContent || Boolean(reviewedText.trim())
    : Boolean(reviewedText.trim())
  const incompleteRowCount = structuredRows.filter((row) => getMissingRowFields(row).length > 0).length
  const hasEnrichingRow = structuredRows.some((row) => row.enrichment_status === 'enriching')

  return (
    <section className="smart-import-page">
      <section className="import-step" aria-label="Input">
        {showPreview && !inputExpanded ? (
          <CompletedStep
            onEdit={() => setInputExpanded(true)}
            summary={mode === 'text'
              ? `Paste Text · ${pastedText.length.toLocaleString()} characters`
              : `Upload Image · ${selectedImage?.name || 'Image selected'}`}
            title="Input"
          />
        ) : <>
          <div className="import-step-heading">
            <span className="import-step-number" aria-hidden="true">1</span>
            <div>
              <h3 id="import-input-title">Input</h3>
              <p>{mode === 'text' ? 'Paste the English text you want to review.' : 'Choose an image containing English or bilingual vocabulary text.'}</p>
            </div>
          </div>

          <div className="import-mode-switch" aria-label="Import source">
            <button
              aria-pressed={mode === 'text'}
              className={`add-mode-button${mode === 'text' ? ' active' : ''}`}
              onClick={() => setMode('text')}
              type="button"
            >
              Paste Text
            </button>
            <button
              aria-pressed={mode === 'image'}
              className={`add-mode-button${mode === 'image' ? ' active' : ''}`}
              onClick={() => setMode('image')}
              type="button"
            >
              Upload Image
            </button>
          </div>

          {mode === 'text' ? (
          <div className="import-input-content">
            <label htmlFor="import-pasted-text">English text</label>
            <textarea
              id="import-pasted-text"
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="Paste a paragraph, article, IELTS passage, or notes here…"
              rows="12"
              value={pastedText}
            />
            <div className="import-text-meta" aria-live="polite">
              <span>{pastedText.length.toLocaleString()} characters</span>
              <span>{countWords(pastedText).toLocaleString()} words</span>
            </div>
            <div className="import-actions">
              <button className="subtle-button" disabled={!pastedText} onClick={handleClearText} type="button">Clear</button>
              <button className="secondary-button" disabled={!pastedText.trim()} onClick={handleAnalyzeText} type="button">Analyze Text</button>
            </div>
          </div>
        ) : (
          <div className="import-input-content">
            <div className="form-field">
              <label htmlFor="import-image">Image file</label>
              <input
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                id="import-image"
                onChange={handleImageChange}
                ref={fileInputRef}
                type="file"
              />
              <p className="import-field-help">PNG, JPG, JPEG, or WEBP. Maximum size: 8 MB.</p>
            </div>

            {selectedImage && (
              <div className="import-image-card">
                <img alt={`Preview of ${selectedImage.name}`} src={imagePreviewUrl} />
                <div className="import-image-details">
                  <strong>{selectedImage.name}</strong>
                  <span>{(selectedImage.size / (1024 * 1024)).toFixed(2)} MB</span>
                  <button className="subtle-button" disabled={isExtracting} onClick={handleRemoveImage} type="button">Remove image</button>
                </div>
              </div>
            )}

            {validationError && <p className="message error-message" role="alert">{validationError}</p>}

            <button className="secondary-button" disabled={!selectedImage || isExtracting} onClick={handleExtractText} type="button">
              {isExtracting ? 'Extracting text…' : 'Extract Text'}
            </button>
            {isExtracting && <p className="message import-progress" role="status">Extracting and arranging text. This may take a moment…</p>}
          </div>
          )}
        </>}
      </section>

      {showPreview && (
        <section className="import-step" aria-label="Preview and edit">
          {isReady && !previewExpanded ? (
            <CompletedStep
              onEdit={() => setPreviewExpanded(true)}
              summary={previewMode === 'table' ? `${structuredRows.length} vocabulary rows reviewed` : 'Text reviewed'}
              title="Preview and edit"
            />
          ) : <>
          <div className="import-step-heading">
            <span className="import-step-number" aria-hidden="true">2</span>
            <div>
              <h3 id="import-preview-title">Preview and edit</h3>
              <p>Review the text carefully and correct anything before continuing.</p>
            </div>
          </div>

          <div className="import-input-content">
            {previewSource === 'ocr' && previewMode === 'table' ? (
              <>
                <div className="ocr-table-preview-heading">
                  <div>
                    <h4>Detected vocabulary rows</h4>
                    <p>Edit any field that OCR did not read correctly.</p>
                  </div>
                  <div className="ocr-table-actions">
                    <span className="import-status import-status-success">Table mode</span>
                    <button
                      className="secondary-button"
                      disabled={isBulkEnriching || hasEnrichingRow || incompleteRowCount === 0}
                      onClick={handleFillAllMissing}
                      type="button"
                    >
                      {isBulkEnriching ? 'Filling Missing…' : 'Fill Missing for All'}
                    </button>
                  </div>
                </div>

                {structuredRows.length ? (
                  <div className="ocr-row-list">
                    {structuredRows.map((row, rowIndex) => {
                      const missingFields = getMissingRowFields(row)
                      const rowIsIncomplete = missingFields.length > 0

                      return (
                        <article className={`ocr-row-card${rowIsIncomplete ? ' ocr-row-incomplete' : ''}`} key={row.id}>
                          <div className="ocr-row-heading">
                            <h5>Row {rowIndex + 1}</h5>
                            <div className="ocr-row-heading-actions">
                              <span className={`ocr-row-status${rowIsIncomplete ? ' incomplete' : ''}`}>
                                {rowIsIncomplete ? 'Incomplete' : 'Complete'}
                              </span>
                              {rowIsIncomplete && (
                                <button
                                  className="subtle-button"
                                  disabled={isBulkEnriching || row.enrichment_status === 'enriching'}
                                  onClick={() => enrichRow(row)}
                                  type="button"
                                >
                                  {row.enrichment_status === 'enriching'
                                    ? 'Filling…'
                                    : row.enrichment_status === 'failed' ? 'Retry' : 'Fill Missing'}
                                </button>
                              )}
                            </div>
                          </div>

                          {rowIsIncomplete && (
                            <p className="ocr-row-missing">
                              Missing: {missingFields.map((field) => structuredFieldLabels[field]).join(', ')}
                            </p>
                          )}

                          {row.parser_warnings.map((warning) => (
                            <p className="ocr-parser-warning" key={warning}>{warning}</p>
                          ))}

                          {row.enrichment_status === 'failed' && (
                            <p className="message error-message ocr-enrichment-error" role="alert">{row.enrichment_error}</p>
                          )}

                          {row.enrichment_status === 'enriched' && (
                            <p className="ocr-enrichment-success" role="status">
                              {row.enrichment_notice || 'Missing fields were filled where lookup data was available.'}
                            </p>
                          )}

                          <div className="ocr-row-fields">
                            <div className={`form-field${row.filled_fields.includes('word') ? ' ocr-field-filled' : ''}`}>
                              <label htmlFor={`ocr-row-${rowIndex}-word`}>Word</label>
                              {row.filled_fields.includes('word') && <span className="ocr-filled-badge">Filled</span>}
                              <input
                                id={`ocr-row-${rowIndex}-word`}
                                onChange={(event) => handleStructuredRowChange(rowIndex, 'word', event.target.value)}
                                type="text"
                                value={row.word}
                              />
                            </div>
                            <div className={`form-field${row.filled_fields.includes('phonetic') ? ' ocr-field-filled' : ''}`}>
                              <label htmlFor={`ocr-row-${rowIndex}-phonetic`}>Phonetic</label>
                              {row.filled_fields.includes('phonetic') && <span className="ocr-filled-badge">Filled</span>}
                              <input
                                id={`ocr-row-${rowIndex}-phonetic`}
                                onChange={(event) => handleStructuredRowChange(rowIndex, 'phonetic', event.target.value)}
                                type="text"
                                value={row.phonetic}
                              />
                            </div>
                            <div className={`form-field${row.filled_fields.includes('part_of_speech') ? ' ocr-field-filled' : ''}`}>
                              <label htmlFor={`ocr-row-${rowIndex}-part-of-speech`}>Part of Speech</label>
                              {row.filled_fields.includes('part_of_speech') && <span className="ocr-filled-badge">Filled</span>}
                              <input
                                id={`ocr-row-${rowIndex}-part-of-speech`}
                                onChange={(event) => handleStructuredRowChange(rowIndex, 'part_of_speech', event.target.value)}
                                type="text"
                                value={row.part_of_speech}
                              />
                            </div>
                            <div className={`form-field ocr-field-wide${row.filled_fields.includes('meaning_vi') ? ' ocr-field-filled' : ''}`}>
                              <label htmlFor={`ocr-row-${rowIndex}-meaning-vi`}>Vietnamese Meaning</label>
                              {row.filled_fields.includes('meaning_vi') && <span className="ocr-filled-badge">Filled</span>}
                              <textarea
                                id={`ocr-row-${rowIndex}-meaning-vi`}
                                onChange={(event) => handleStructuredRowChange(rowIndex, 'meaning_vi', event.target.value)}
                                rows="2"
                                value={row.meaning_vi}
                              />
                            </div>
                            <div className={`form-field ocr-field-wide${row.filled_fields.includes('meaning_en') ? ' ocr-field-filled' : ''}`}>
                              <label htmlFor={`ocr-row-${rowIndex}-meaning-en`}>English Meaning</label>
                              {row.filled_fields.includes('meaning_en') && <span className="ocr-filled-badge">Filled</span>}
                              <textarea
                                id={`ocr-row-${rowIndex}-meaning-en`}
                                onChange={(event) => handleStructuredRowChange(rowIndex, 'meaning_en', event.target.value)}
                                rows="2"
                                value={row.meaning_en}
                              />
                            </div>
                            <div className={`form-field ocr-field-wide${row.filled_fields.includes('example') ? ' ocr-field-filled' : ''}`}>
                              <label htmlFor={`ocr-row-${rowIndex}-example`}>Example</label>
                              {row.filled_fields.includes('example') && <span className="ocr-filled-badge">Filled</span>}
                              <textarea
                                id={`ocr-row-${rowIndex}-example`}
                                onChange={(event) => handleStructuredRowChange(rowIndex, 'example', event.target.value)}
                                rows="2"
                                value={row.example}
                              />
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <p className="message notice-message">The image looks like a table, but no rows could be separated reliably. Use the raw OCR text below for manual recovery.</p>
                )}

                <details className="ocr-raw-details">
                  <summary>View raw OCR text</summary>
                  <div className="ocr-raw-content">
                    <label htmlFor="import-reviewed-text">Raw extracted text</label>
                    <textarea id="import-reviewed-text" onChange={handleReviewedTextChange} rows="12" value={reviewedText} />
                  </div>
                </details>
              </>
            ) : (
              <>
                <label htmlFor="import-reviewed-text">{previewSource === 'ocr' ? 'Extracted Text' : 'Text Preview'}</label>
                <textarea id="import-reviewed-text" onChange={handleReviewedTextChange} rows="12" value={reviewedText} />
              </>
            )}
            {previewSource === 'ocr' && (
              <div className="ocr-metadata" aria-live="polite">
                <p className="import-confidence">
                  OCR source: <strong>{ocrSource === 'ocr.space' ? 'OCR.space' : 'Tesseract fallback'}</strong>
                </p>
                {ocrConfidence !== null && (
                  <p className="import-confidence">OCR confidence: <strong>{ocrConfidence}%</strong></p>
                )}
              </div>
            )}
            <p className="message notice-message">
              {previewMode === 'text'
                ? 'Continue to analyze this text by CEFR vocabulary level.'
                : 'Structured vocabulary rows keep their existing review and Smart Fill workflow; CEFR text analysis is not applied to table mode.'}
            </p>
          </div>
          </>}
        </section>
      )}

      {showPreview && (
        <section className="import-step" aria-label="Continue">
          {isReady && !continueExpanded ? (
            <CompletedStep
              onEdit={() => setContinueExpanded(true)}
              summary={previewMode === 'table' ? 'Table review complete' : 'Ready for analysis'}
              title="Continue"
            />
          ) : <>
          <div className="import-step-heading">
            <span className="import-step-number" aria-hidden="true">3</span>
            <div>
              <h3 id="import-continue-title">Continue</h3>
              <p>Continue only after the text looks correct.</p>
            </div>
          </div>

          <button className="primary-button" disabled={!canContinue || isAnalyzing} onClick={handleContinue} type="button">
            {isAnalyzing
              ? 'Analyzing CEFR Levels…'
              : previewMode === 'table' ? 'Finish Table Review' : 'Continue to Analysis'}
          </button>
          {isAnalyzing && <p className="message import-progress" role="status">Analyzing the complete text with the local CEFR dataset…</p>}
          {analysisError && <p className="message error-message import-ready" role="alert">{analysisError}</p>}
          {isReady && previewMode === 'table' && (
            <p className="message success-message import-ready" role="status">Structured rows are ready for the existing import workflow.</p>
          )}
          </>}
        </section>
      )}

      {isReady && previewMode === 'text' && cefrAnalysis && (
        <CefrAnalysisPanel
          analysis={cefrAnalysis}
          onVocabularyCreated={onVocabularyCreated}
          text={reviewedText}
        />
      )}
    </section>
  )
}

export default ImportPage
