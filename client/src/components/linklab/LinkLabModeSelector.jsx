import { useEffect, useState } from 'react'
import { eligibleWords, LINKLAB_MODES } from '../../utils/linkLab.js'

const modeIcons = { classic: '↔', deep: '⛓', visual: '▧', speed: '◷' }
const filters = ['all', 'new', 'learning', 'learned', 'due']
const sizes = [12, 18, 24]

function SetCover({ vocabularySet }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [vocabularySet?.cover_image_url])
  return vocabularySet?.cover_image_url && !failed
    ? <img alt="" onError={() => setFailed(true)} src={vocabularySet.cover_image_url} />
    : <span aria-hidden="true">Aa</span>
}

export default function LinkLabModeSelector({
  error, filter, isLoading, notice, onBack, onFilterChange, onSizeChange,
  onSourceChange, onStart, sessionSize, source, vocabularySet,
}) {
  const isAllVocabulary = source === 'all'
  return (
    <div className="linklab-selector">
      <button className="linklab-back" onClick={onBack} type="button">← Back to Review Sets</button>

      <section className="linklab-source-panel" aria-labelledby="linklab-source-title">
        <div><span className="linklab-eyebrow">Practice source</span><h3 id="linklab-source-title">Choose where to build your session</h3></div>
        <div className="linklab-source-switch" role="group" aria-label="Practice source">
          <button aria-pressed={source === 'set'} disabled={!vocabularySet} onClick={() => onSourceChange('set')} type="button"><span aria-hidden="true">▤</span> Review Set</button>
          <button aria-pressed={isAllVocabulary} onClick={() => onSourceChange('all')} type="button"><span aria-hidden="true">⤨</span> All Vocabulary</button>
        </div>
      </section>

      {isAllVocabulary ? (
        <section className="linklab-set-banner linklab-all-banner" aria-label="All vocabulary random practice">
          <span className="linklab-shuffle-mark" aria-hidden="true">⤨</span>
          <div><small>Personal vocabulary library</small><h3>All Vocabulary</h3><p>A fresh server-randomized session, filtered to the words you want to practice.</p></div>
          <div className="linklab-random-options">
            <fieldset><legend>Status</legend>{filters.map((value) => <button aria-pressed={filter === value} key={value} onClick={() => onFilterChange(value)} type="button">{value[0].toUpperCase() + value.slice(1)}</button>)}</fieldset>
            <fieldset><legend>Session size</legend>{sizes.map((value) => <button aria-pressed={sessionSize === value} key={value} onClick={() => onSizeChange(value)} type="button">{value}</button>)}</fieldset>
          </div>
          <div className="linklab-orbit" aria-hidden="true"><i /><i /><i /></div>
        </section>
      ) : (
        <section className="linklab-set-banner" aria-label="Selected vocabulary set">
          <SetCover vocabularySet={vocabularySet} />
          <div><small>Selected review set</small><h3>{vocabularySet.title}</h3><p>{vocabularySet.word_count} {vocabularySet.word_count === 1 ? 'word' : 'words'} ready for focused practice</p></div>
          <div className="linklab-orbit" aria-hidden="true"><i /><i /><i /></div>
        </section>
      )}

      {error && <p className="linklab-source-message error" role="alert">{error}</p>}
      {notice && <p className="linklab-source-message" role="status">{notice}</p>}

      <div className="linklab-mode-heading">
        <div><span className="linklab-eyebrow">Choose your lab</span><h3>How do you want to connect?</h3></div>
        <p>{isAllVocabulary ? `Requesting ${sessionSize} random ${filter === 'all' ? '' : filter} words from your library.` : 'Each mode uses only this review set. Your SRS schedule stays unchanged.'}</p>
      </div>
      <div className="linklab-mode-grid">
        {Object.entries(LINKLAB_MODES).map(([id, mode], index) => {
          const usableCount = isAllVocabulary ? null : eligibleWords(vocabularySet.words, id).length
          const unavailable = usableCount !== null && usableCount < 2
          return (
            <article className={`linklab-mode-card mode-${id} ${unavailable ? 'unavailable' : ''}`} key={id}>
              <div className="linklab-mode-number">0{index + 1}</div>
              <span className="linklab-mode-icon" aria-hidden="true">{modeIcons[id]}</span>
              <h4>{mode.title}</h4><p>{mode.description}</p>
              <div className="linklab-mode-meta"><span>{isAllVocabulary ? `${sessionSize} requested` : `${usableCount} usable`}</span><span>{unavailable && id === 'visual' ? 'Needs 2 images' : `${mode.roundSize} / round`}</span></div>
              <button aria-label={`Start ${mode.title}`} disabled={unavailable || isLoading} onClick={() => onStart(id)} type="button">{isLoading ? 'Preparing…' : unavailable ? 'Unavailable' : 'Start'} <span aria-hidden="true">→</span></button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
