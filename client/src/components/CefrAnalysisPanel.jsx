import { useMemo, useState } from 'react'
import BulkImportSection from './BulkImportSection.jsx'

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unknown']
const advancedLevelGroups = {
  'B2+': new Set(['B2', 'C1', 'C2']),
  'C1+': new Set(['C1', 'C2']),
}

function buildUniqueWords(tokens) {
  const words = new Map()

  for (const token of tokens) {
    const current = words.get(token.normalized)

    if (!current) {
      words.set(token.normalized, {
        normalized: token.normalized,
        display: token.text,
        level: token.level,
        existing: Boolean(token.existing),
        occurrences: 1,
      })
    } else {
      current.occurrences += 1
      current.existing = current.existing || Boolean(token.existing)
    }
  }

  return words
}

function CefrAnalysisPanel({ analysis, onVocabularyCreated, text }) {
  const [enabledLevels, setEnabledLevels] = useState(() => new Set(levels))
  const [focusedWord, setFocusedWord] = useState('')
  const [selectedWords, setSelectedWords] = useState(() => new Set())
  const [preparedWords, setPreparedWords] = useState([])
  const uniqueWords = useMemo(() => buildUniqueWords(analysis.tokens), [analysis.tokens])
  const focused = focusedWord ? uniqueWords.get(focusedWord) : null
  const selected = [...selectedWords]
    .map((normalized) => uniqueWords.get(normalized))
    .filter(Boolean)

  function toggleLevel(level) {
    setEnabledLevels((currentLevels) => {
      const nextLevels = new Set(currentLevels)
      if (nextLevels.has(level)) nextLevels.delete(level)
      else nextLevels.add(level)
      return nextLevels
    })
  }

  function updateSelection(nextSelection) {
    setSelectedWords(nextSelection)
    setPreparedWords([])
  }

  function toggleWordSelection(word) {
    if (!word || word.existing) return

    const nextSelection = new Set(selectedWords)
    if (nextSelection.has(word.normalized)) nextSelection.delete(word.normalized)
    else nextSelection.add(word.normalized)
    updateSelection(nextSelection)
  }

  function selectLevelGroup(groupName) {
    const groupLevels = advancedLevelGroups[groupName]
    const nextSelection = new Set(selectedWords)

    for (const word of uniqueWords.values()) {
      if (groupLevels.has(word.level) && !word.existing) nextSelection.add(word.normalized)
    }

    updateSelection(nextSelection)
  }

  function removeSelectedWord(normalized) {
    const nextSelection = new Set(selectedWords)
    nextSelection.delete(normalized)
    updateSelection(nextSelection)
  }

  function renderHighlightedText() {
    const fragments = []
    let cursor = 0

    analysis.tokens.forEach((token, index) => {
      if (token.start > cursor) {
        fragments.push(<span key={`gap-${index}`}>{text.slice(cursor, token.start)}</span>)
      }

      if (enabledLevels.has(token.level)) {
        const isSelected = selectedWords.has(token.normalized)
        fragments.push(
          <button
            aria-label={`${token.text}: ${token.level}${token.existing ? ', already in vocabulary' : ''}`}
            className={`cefr-token cefr-${token.level.toLocaleLowerCase()}${isSelected ? ' selected' : ''}`}
            data-level={token.level}
            key={`token-${index}`}
            onClick={() => setFocusedWord(token.normalized)}
            title={`${token.text} — ${token.level}`}
            type="button"
          >
            {token.text}
          </button>,
        )
      } else {
        fragments.push(<span key={`token-${index}`}>{token.text}</span>)
      }

      cursor = token.end
    })

    if (cursor < text.length) fragments.push(<span key="final-gap">{text.slice(cursor)}</span>)
    return fragments
  }

  return (
    <section className="import-step cefr-analysis" aria-labelledby="cefr-analysis-title">
      <div className="import-step-heading">
        <span className="import-step-number" aria-hidden="true">4</span>
        <div>
          <h3 id="cefr-analysis-title">CEFR vocabulary analysis</h3>
          <p>Filter levels, inspect a word, and choose vocabulary to prepare for lookup.</p>
        </div>
      </div>

      <div className="cefr-filters" aria-label="CEFR highlight filters">
        {levels.map((level) => (
          <button
            aria-pressed={enabledLevels.has(level)}
            className={`cefr-filter cefr-${level.toLocaleLowerCase()}${enabledLevels.has(level) ? ' active' : ''}`}
            key={level}
            onClick={() => toggleLevel(level)}
            type="button"
          >
            <span>{level}</span>
            <strong>{analysis.summary[level] || 0}</strong>
          </button>
        ))}
      </div>

      <p className="cefr-filter-help">Filter counts show occurrences. Turning a filter off keeps the original text visible and removes only that level’s highlighting.</p>

      <div className="cefr-text" aria-label="Analyzed text">
        {renderHighlightedText()}
      </div>

      <div className="cefr-workspace">
        <section className="cefr-detail" aria-labelledby="cefr-detail-title">
          <h4 id="cefr-detail-title">Word details</h4>
          {focused ? (
            <>
              <dl>
                <div><dt>Word</dt><dd>{focused.display}</dd></div>
                <div><dt>Normalized</dt><dd>{focused.normalized}</dd></div>
                <div><dt>CEFR level</dt><dd>{focused.level}</dd></div>
                <div><dt>Occurrences</dt><dd>{focused.occurrences}</dd></div>
                <div><dt>Vocabulary status</dt><dd>{focused.existing ? 'Already in vocabulary' : 'Not in vocabulary'}</dd></div>
              </dl>
              <button
                className={selectedWords.has(focused.normalized) ? 'subtle-button' : 'secondary-button'}
                disabled={focused.existing}
                onClick={() => toggleWordSelection(focused)}
                type="button"
              >
                {focused.existing
                  ? 'Already added'
                  : selectedWords.has(focused.normalized) ? 'Remove from selection' : 'Select for learning'}
              </button>
            </>
          ) : (
            <p>Choose a highlighted word to inspect its normalized form, level, and vocabulary status.</p>
          )}
        </section>

        <section className="cefr-selection" aria-labelledby="cefr-selection-title">
          <div className="cefr-selection-heading">
            <div>
              <h4 id="cefr-selection-title">Selected words</h4>
              <p>{selected.length} unique {selected.length === 1 ? 'word' : 'words'}</p>
            </div>
            <div className="cefr-selection-actions">
              <button className="subtle-button" onClick={() => selectLevelGroup('B2+')} type="button">Select all B2+</button>
              <button className="subtle-button" onClick={() => selectLevelGroup('C1+')} type="button">Select all C1+</button>
              <button className="subtle-button" disabled={!selected.length} onClick={() => updateSelection(new Set())} type="button">Clear</button>
            </div>
          </div>

          {selected.length ? (
            <div className="cefr-selected-list">
              {selected.map((word) => (
                <div className="cefr-selected-row" key={word.normalized}>
                  <span><strong>{word.normalized}</strong> · {word.level} · Not in vocabulary</span>
                  <button className="subtle-button" onClick={() => removeSelectedWord(word.normalized)} type="button">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="cefr-empty-selection">No words selected yet. Repeated words are added only once by normalized form.</p>
          )}

          <button
            className="primary-button"
            disabled={!selected.length}
            onClick={() => setPreparedWords(selected.map((word) => word.normalized))}
            type="button"
          >
            Prepare Selected Words
          </button>
        </section>
      </div>

      {preparedWords.length > 0 && (
        <div className="cefr-prepared-import">
          <p className="message notice-message">Selected words are prepared below. Lookup and saving remain manual.</p>
          <BulkImportSection
            initialWords={preparedWords}
            key={preparedWords.join('|')}
            onVocabularyCreated={onVocabularyCreated}
          />
        </div>
      )}
    </section>
  )
}

export default CefrAnalysisPanel
