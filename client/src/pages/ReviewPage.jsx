import { useEffect, useState } from 'react'
import { getSmartReviewCards, rateVocabularyReview } from '../api/vocabularies.js'
import { getVocabularySet, getVocabularySets, updateVocabularySet } from '../api/vocabularySets.js'
import PronunciationButton from '../components/PronunciationButton.jsx'
import { getEnglishDefinition, getVietnameseMeaning } from '../utils/vocabulary.js'

function localCreatedDate(value) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function VocabularySetCover({ vocabularySet }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [vocabularySet.cover_image_url])

  return vocabularySet.cover_image_url && !failed
    ? <img alt="" className="review-set-cover" onError={() => setFailed(true)} src={vocabularySet.cover_image_url} />
    : <div className="review-set-cover review-set-cover-placeholder" aria-hidden="true">Aa</div>
}

function ReviewPage({ initialMode = 'smart' }) {
  const [mode, setMode] = useState(initialMode)
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isSessionStarted, setIsSessionStarted] = useState(initialMode === 'smart')
  const [activeSet, setActiveSet] = useState(null)
  const [setPage, setSetPage] = useState(1)
  const [setListing, setSetListing] = useState({ items: [], page: 1, total_pages: 1, total: 0 })
  const [setDetails, setSetDetails] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCover, setEditCover] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  useEffect(() => {
    if (mode !== 'smart') return undefined
    let active = true

    async function loadSmartReview() {
      setIsLoading(true)
      setError('')
      setIsSessionStarted(true)
      setActiveSet(null)
      try {
        const reviewCards = await getSmartReviewCards()
        if (!active) return
        setCards(reviewCards)
        setCurrentIndex(0)
        setIsRevealed(false)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    loadSmartReview()
    return () => { active = false }
  }, [mode])

  useEffect(() => {
    if (mode !== 'sets' || isSessionStarted) return undefined
    let active = true

    async function loadSets() {
      setIsLoading(true)
      setError('')
      try {
        const result = await getVocabularySets(setPage)
        if (active) setSetListing(result)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    loadSets()
    return () => { active = false }
  }, [mode, setPage, isSessionStarted])

  useEffect(() => setImageLoadFailed(false), [cards, currentIndex])

  function chooseMode(nextMode) {
    setMode(nextMode)
    setActionError('')
    setError('')
    setSetDetails(null)
    if (nextMode === 'sets') {
      setCards([])
      setCurrentIndex(0)
      setIsSessionStarted(false)
    }
  }

  async function readSet(id) {
    setIsLoading(true)
    setError('')
    try {
      return await getVocabularySet(id)
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  async function showSetDetails(id) {
    const details = await readSet(id)
    if (!details) return
    setSetDetails(details)
    setEditTitle(details.title)
    setEditCover(details.cover_image_url || '')
  }

  async function startSetReview(id) {
    const details = await readSet(id)
    if (!details?.words.length) return
    setActiveSet(details)
    setCards(details.words)
    setCurrentIndex(0)
    setIsRevealed(false)
    setIsSessionStarted(true)
    setSetDetails(null)
    setActionError('')
  }

  async function saveSetDetails(event) {
    event.preventDefault()
    setIsUpdating(true)
    setActionError('')
    try {
      const updated = await updateVocabularySet(setDetails.id, {
        title: editTitle,
        cover_image_url: editCover,
      })
      setSetDetails((details) => ({ ...details, ...updated }))
      setSetListing((listing) => ({
        ...listing,
        items: listing.items.map((item) => item.id === updated.id ? { ...item, ...updated } : item),
      }))
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setIsUpdating(false)
    }
  }

  async function rateCard(rating) {
    const currentCard = cards[currentIndex]
    setIsUpdating(true)
    setActionError('')
    try {
      await rateVocabularyReview(currentCard.id, rating)
      setCurrentIndex((index) => index + 1)
      setIsRevealed(false)
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setIsUpdating(false)
    }
  }

  function returnToSets() {
    setIsSessionStarted(false)
    setCards([])
    setCurrentIndex(0)
    setIsRevealed(false)
    setActiveSet(null)
    setActionError('')
  }

  const currentCard = cards[currentIndex]
  const sessionComplete = isSessionStarted && cards.length > 0 && currentIndex >= cards.length
  const hasImage = Boolean(currentCard?.image_url) && !imageLoadFailed

  return (
    <section className="review-section">
      <div className="review-mode-switch" aria-label="Review mode">
        <button aria-pressed={mode === 'smart'} className={mode === 'smart' ? 'active' : ''} onClick={() => chooseMode('smart')} type="button">Smart Review</button>
        <button aria-pressed={mode === 'sets'} className={mode === 'sets' ? 'active' : ''} onClick={() => chooseMode('sets')} type="button">Review Sets</button>
      </div>

      {mode === 'sets' && isSessionStarted && (
        <div className="review-set-session-heading">
          <button className="subtle-button" onClick={returnToSets} type="button">← Back to Review Sets</button>
          {activeSet && <div><strong>{activeSet.title}</strong><span>{activeSet.word_count} words</span></div>}
        </div>
      )}

      {isLoading && <p className="message" role="status">Loading…</p>}
      {error && <p className="message error-message" role="alert">Could not load review data: {error}</p>}

      {!isLoading && !error && mode === 'sets' && !isSessionStarted && (
        <>
          <section className="review-sets-heading">
            <div>
              <h3>Review Sets</h3>
              <p>Choose a saved import or study collection. Ratings update the same spaced-repetition schedule and history as Smart Review.</p>
            </div>
            <span>{setListing.total} {setListing.total === 1 ? 'set' : 'sets'}</span>
          </section>

          {setListing.items.length === 0 ? (
            <p className="message notice-message">No vocabulary sets yet. Existing vocabulary without a set remains available in Smart Review.</p>
          ) : (
            <div className="review-set-grid">
              {setListing.items.map((set) => (
                <article className="review-set-card" key={set.id}>
                  <VocabularySetCover vocabularySet={set} />
                  <div className="review-set-card-body">
                    <h4>{set.title}</h4>
                    <p>Created {localCreatedDate(set.created_at)}</p>
                    <strong>{set.word_count} {set.word_count === 1 ? 'word' : 'words'}</strong>
                    <div className="review-set-card-actions">
                      <button className="subtle-button" onClick={() => showSetDetails(set.id)} type="button">Details</button>
                      <button className="primary-button" disabled={!set.word_count} onClick={() => startSetReview(set.id)} type="button">Start Review</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {setListing.total_pages > 1 && (
            <nav className="review-set-pagination" aria-label="Review set pages">
              <button className="subtle-button" disabled={setPage === 1} onClick={() => setSetPage((page) => page - 1)} type="button">Previous</button>
              {Array.from({ length: setListing.total_pages }, (_, index) => index + 1).map((page) => (
                <button aria-current={page === setPage ? 'page' : undefined} className={page === setPage ? 'active' : ''} key={page} onClick={() => setSetPage(page)} type="button">{page}</button>
              ))}
              <button className="subtle-button" disabled={setPage === setListing.total_pages} onClick={() => setSetPage((page) => page + 1)} type="button">Next</button>
            </nav>
          )}

          {setDetails && (
            <section className="review-set-details" aria-labelledby="review-set-details-title">
              <div className="review-set-details-heading">
                <div>
                  <h3 id="review-set-details-title">Set details</h3>
                  <p>{setDetails.word_count} {setDetails.word_count === 1 ? 'word' : 'words'} · Created {localCreatedDate(setDetails.created_at)}</p>
                </div>
                <button className="subtle-button" onClick={() => setSetDetails(null)} type="button">Close</button>
              </div>
              <form className="review-set-edit-form" onSubmit={saveSetDetails}>
                <label>Title<input maxLength="160" onChange={(event) => setEditTitle(event.target.value)} required value={editTitle} /></label>
                <label>Cover image URL<input onChange={(event) => setEditCover(event.target.value)} placeholder="https://…" type="url" value={editCover} /></label>
                <button className="secondary-button" disabled={isUpdating} type="submit">{isUpdating ? 'Saving…' : 'Save Set Details'}</button>
              </form>
              {actionError && <p className="message error-message" role="alert">Could not update set: {actionError}</p>}
              <div className="review-set-word-list">{setDetails.words.map((word) => <span key={word.id}>{word.word}</span>)}</div>
              <button className="primary-button" disabled={!setDetails.words.length} onClick={() => startSetReview(setDetails.id)} type="button">Start Review</button>
            </section>
          )}
        </>
      )}

      {!isLoading && !error && mode === 'smart' && cards.length === 0 && <p className="message success-message" role="status">You’re all caught up! There are no due or new cards to review.</p>}

      {!isLoading && !error && sessionComplete && (
        <div className="review-session-complete">
          <p className="message success-message" role="status">Great work! You completed this review session.</p>
          {mode === 'sets' && <button className="secondary-button" onClick={returnToSets} type="button">Choose Another Set</button>}
        </div>
      )}

      {!isLoading && !error && isSessionStarted && currentCard && (
        <>
          <p className="review-progress">Card {currentIndex + 1} of {cards.length}</p>
          <article className="flashcard">
            {!isRevealed && hasImage && <><p className="flashcard-label">What is this?</p><img alt="Vocabulary image" className="flashcard-image flashcard-image-front" onError={() => setImageLoadFailed(true)} src={currentCard.image_url} /></>}
            {!isRevealed && !hasImage && <><p className="flashcard-label">Word</p><h3>{currentCard.word}</h3></>}
            {isRevealed && (
              <div className="flashcard-answer">
                {hasImage && <img alt={`Illustration for ${currentCard.word}`} className="flashcard-image" onError={() => setImageLoadFailed(true)} src={currentCard.image_url} />}
                <p className="flashcard-label">Answer</p>
                <h3>{currentCard.word}</h3>
                <PronunciationButton audioUrl={currentCard.audio_url} word={currentCard.word} />
                {currentCard.phonetic && <p className="phonetic">{currentCard.phonetic}</p>}
                {currentCard.part_of_speech && <p className="part-of-speech">{currentCard.part_of_speech}</p>}
                <p className="flashcard-primary-meaning"><strong>Vietnamese Meaning:</strong> {getVietnameseMeaning(currentCard) || 'No Vietnamese meaning added.'}</p>
                {getEnglishDefinition(currentCard) && <p className="flashcard-supporting-definition"><strong>English Definition:</strong> {getEnglishDefinition(currentCard)}</p>}
                {currentCard.example && <p><strong>Example:</strong> {currentCard.example}</p>}
              </div>
            )}
          </article>

          {actionError && <p className="message error-message" role="alert">Could not save review: {actionError}</p>}
          {!isRevealed ? (
            <button className="primary-button" onClick={() => setIsRevealed(true)} type="button">Show Answer</button>
          ) : (
            <div className="review-rating-actions">
              {['again', 'hard', 'good', 'easy'].map((rating) => (
                <button className={`review-rating-${rating}`} disabled={isUpdating} key={rating} onClick={() => rateCard(rating)} type="button">{isUpdating ? 'Saving…' : rating[0].toUpperCase() + rating.slice(1)}</button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default ReviewPage
