import { useEffect, useState } from 'react'
import { getVocabularies, updateVocabularyStatus } from '../api/vocabularies.js'
import PronunciationButton from '../components/PronunciationButton.jsx'
import { getEnglishDefinition, getVietnameseMeaning } from '../utils/vocabulary.js'

function ReviewPage() {
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  useEffect(() => {
    async function loadReviewCards() {
      setIsLoading(true)
      setError('')

      try {
        const vocabularies = await getVocabularies()
        const reviewableCards = vocabularies.filter(
          (vocabulary) => vocabulary.status === 'new' || vocabulary.status === 'learning',
        )
        setCards(reviewableCards)
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadReviewCards()
  }, [])

  useEffect(() => {
    setImageLoadFailed(false)
  }, [currentIndex])

  async function rateCard(status) {
    const currentCard = cards[currentIndex]
    setIsUpdating(true)
    setActionError('')

    try {
      await updateVocabularyStatus(currentCard.id, status)
      setCurrentIndex((index) => index + 1)
      setIsRevealed(false)
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return <p className="message" role="status">Loading review cards…</p>
  }

  if (error) {
    return <p className="message error-message" role="alert">Could not load review cards: {error}</p>
  }

  if (cards.length === 0) {
    return <p className="message success-message" role="status">You’re all caught up! There are no words to review.</p>
  }

  if (currentIndex >= cards.length) {
    return <p className="message success-message" role="status">Great work! You completed this review session.</p>
  }

  const currentCard = cards[currentIndex]
  const vietnameseMeaning = getVietnameseMeaning(currentCard)
  const englishDefinition = getEnglishDefinition(currentCard)
  const hasImage = Boolean(currentCard.image_url) && !imageLoadFailed

  return (
    <section className="review-section">
      <p className="review-progress">
        Card {currentIndex + 1} of {cards.length}
      </p>

      <article className="flashcard">
        {!isRevealed && hasImage && (
          <>
            <p className="flashcard-label">What is this?</p>
            <img
              alt="Vocabulary image"
              className="flashcard-image flashcard-image-front"
              onError={() => setImageLoadFailed(true)}
              src={currentCard.image_url}
            />
          </>
        )}

        {!isRevealed && !hasImage && (
          <>
            <p className="flashcard-label">Word</p>
            <h3>{currentCard.word}</h3>
          </>
        )}

        {isRevealed && (
          <div className="flashcard-answer">
            {hasImage && (
              <img
                alt={`Illustration for ${currentCard.word}`}
                className="flashcard-image"
                onError={() => setImageLoadFailed(true)}
                src={currentCard.image_url}
              />
            )}
            <p className="flashcard-label">Answer</p>
            <h3>{currentCard.word}</h3>
            <PronunciationButton audioUrl={currentCard.audio_url} word={currentCard.word} />
            {currentCard.phonetic && <p className="phonetic">{currentCard.phonetic}</p>}
            {currentCard.part_of_speech && <p className="part-of-speech">{currentCard.part_of_speech}</p>}
            <p className="flashcard-primary-meaning">
              <strong>Vietnamese Meaning:</strong> {vietnameseMeaning || 'No Vietnamese meaning added.'}
            </p>
            {englishDefinition && (
              <p className="flashcard-supporting-definition">
                <strong>English Definition:</strong> {englishDefinition}
              </p>
            )}
            {currentCard.example && (
              <p>
                <strong>Example:</strong> {currentCard.example}
              </p>
            )}
          </div>
        )}
      </article>

      {actionError && <p className="message error-message" role="alert">Could not update status: {actionError}</p>}

      {!isRevealed ? (
        <button className="primary-button" onClick={() => setIsRevealed(true)} type="button">
          Show Answer
        </button>
      ) : (
        <div className="review-actions">
          <button className="secondary-button" disabled={isUpdating} onClick={() => rateCard('learning')} type="button">
            {isUpdating ? 'Saving…' : 'Don’t Know'}
          </button>
          <button className="primary-button" disabled={isUpdating} onClick={() => rateCard('learned')} type="button">
            {isUpdating ? 'Saving…' : 'Know'}
          </button>
        </div>
      )}
    </section>
  )
}

export default ReviewPage
