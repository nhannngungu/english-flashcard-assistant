import { useMemo, useState } from 'react'
import {
  getVocabularyRecommendations,
  prepareVocabularyFromContext,
} from '../api/analysis.js'
import PreparedVocabularyCards from './PreparedVocabularyCards.jsx'

const categoryDefinitions = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'worth-considering', label: 'Worth considering' },
  { key: 'lower-priority', label: 'Lower priority' },
]
const b2Plus = new Set(['B2', 'C1', 'C2'])
const maximumPreparedItems = 30

function itemKey(item) {
  return `${item.type}:${item.normalized}`
}

function priorityLabel(priority) {
  if (priority === 'recommended' || priority === 'high') return 'High priority'
  if (priority === 'worth-considering' || priority === 'medium') return 'Medium priority'
  return 'Lower priority'
}

function VocabularyRecommendations({
  onPreparedItems,
  onVocabularyCreated,
  showPrepared = true,
  text,
}) {
  const [goal, setGoal] = useState('general')
  const [targetLevel, setTargetLevel] = useState('B2')
  const [useAi, setUseAi] = useState(false)
  const [recommendations, setRecommendations] = useState([])
  const [aiStatus, setAiStatus] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [isRanking, setIsRanking] = useState(false)
  const [rankingError, setRankingError] = useState('')
  const [preparedItems, setPreparedItems] = useState(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState('')
  const [expandedGroups, setExpandedGroups] = useState(() => ({
    recommended: true,
    'worth-considering': false,
    'lower-priority': false,
  }))
  const [showAllGroups, setShowAllGroups] = useState(() => ({}))

  const recommendationMap = useMemo(
    () => new Map(recommendations.map((item) => [itemKey(item), item])),
    [recommendations],
  )
  const selectedItems = [...selectedKeys].map((key) => recommendationMap.get(key)).filter(Boolean)

  function resetPreparation() {
    setPreparedItems(null)
    setPrepareError('')
    onPreparedItems?.(null)
  }

  function updateSelection(next) {
    setSelectedKeys(next)
    resetPreparation()
  }

  async function handleRankVocabulary() {
    if (isRanking) return

    setIsRanking(true)
    setRankingError('')
    setRecommendations([])
    setSelectedKeys(new Set())
    setPreparedItems(null)
    setAiStatus(null)
    setExpandedGroups({ recommended: true, 'worth-considering': false, 'lower-priority': false })
    setShowAllGroups({})

    try {
      const result = await getVocabularyRecommendations(text, {
        goal,
        target_level: targetLevel,
      }, useAi)
      setRecommendations(Array.isArray(result.recommendations) ? result.recommendations : [])
      setAiStatus(result.ai || null)
    } catch (error) {
      setRankingError(error.message)
    } finally {
      setIsRanking(false)
    }
  }

  function toggleItem(item) {
    if (item.existing) return

    const key = itemKey(item)
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else if (next.size < maximumPreparedItems) next.add(key)
    updateSelection(next)
  }

  function selectMatching(predicate) {
    const matching = recommendations
      .filter((item) => !item.existing && predicate(item))
      .slice(0, maximumPreparedItems)
      .map(itemKey)
    updateSelection(new Set(matching))
  }

  async function handlePrepareSelected() {
    if (!selectedItems.length || isPreparing) return

    setIsPreparing(true)
    setPrepareError('')
    setPreparedItems(null)

    try {
      const result = await prepareVocabularyFromContext(selectedItems.map((item) => ({
        word: item.term,
        normalized: item.normalized,
        cefr_level: item.cefr_level,
        sentence: item.sentence,
        surrounding_context: item.surrounding_context,
      })))
      const nextPreparedItems = result.items || []
      setPreparedItems(nextPreparedItems)
      onPreparedItems?.(nextPreparedItems)
    } catch (error) {
      setPrepareError(error.message)
    } finally {
      setIsPreparing(false)
    }
  }

  function toggleGroup(group) {
    setExpandedGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  function toggleShowAll(group) {
    setShowAllGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  return (
    <section className="vocabulary-recommendations" aria-labelledby="vocabulary-recommendations-title">
      <div className="recommendations-heading">
        <div>
          <h4 id="vocabulary-recommendations-title">Vocabulary Recommendations</h4>
          <p>Rank useful words and expressions, then choose what to prepare. Nothing is added automatically.</p>
        </div>
      </div>

      <div className="recommendation-preferences">
        <fieldset>
          <legend>Learning goal</legend>
          <label>
            <input checked={goal === 'general'} name="recommendation-goal" onChange={() => setGoal('general')} type="radio" />
            General English
          </label>
          <label>
            <input checked={goal === 'ielts'} name="recommendation-goal" onChange={() => setGoal('ielts')} type="radio" />
            IELTS / Academic
          </label>
        </fieldset>

        <label className="recommendation-target">
          <span>Target level</span>
          <select onChange={(event) => setTargetLevel(event.target.value)} value={targetLevel}>
            {['A2', 'B1', 'B2', 'C1'].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>

        <label className="recommendation-ai-option">
          <input checked={useAi} onChange={(event) => setUseAi(event.target.checked)} type="checkbox" />
          Include optional AI ranking when configured
        </label>

        <button className="secondary-button" disabled={isRanking} onClick={handleRankVocabulary} type="button">
          {isRanking ? 'Ranking Vocabulary…' : recommendations.length ? 'Refresh Recommendations' : 'Get Recommendations'}
        </button>
      </div>

      <p className="recommendation-privacy-note">
        AI is optional and advisory. When enabled, only this passage, candidate terms, and ranking preferences are sent for one ranking request.
      </p>

      {rankingError && <p className="message error-message" role="alert">{rankingError}</p>}
      {useAi && aiStatus?.status === 'unavailable' && (
        <p className="message notice-message" role="status">AI recommendations are unavailable. Showing standard vocabulary ranking.</p>
      )}
      {aiStatus?.status === 'used' && (
        <p className="message success-message" role="status">AI ranking was applied. Its rank score is advisory, not a probability or factual confidence.</p>
      )}

      {recommendations.length > 0 && (
        <>
          <div className="recommendation-selection-actions">
            <button className="subtle-button" onClick={() => selectMatching((item) => item.priority === 'recommended')} type="button">Select Recommended</button>
            <button className="subtle-button" onClick={() => selectMatching((item) => b2Plus.has(item.cefr_level))} type="button">Select B2+</button>
            <button className="subtle-button" disabled={!selectedKeys.size} onClick={() => updateSelection(new Set())} type="button">Clear</button>
            <span>{selectedItems.length}/{maximumPreparedItems} selected</span>
          </div>

          <div className="recommendation-categories">
            {categoryDefinitions.map((category) => {
              const items = recommendations.filter((item) => item.priority === category.key)
              if (!items.length) return null
              const isExpanded = expandedGroups[category.key]
              const showAll = showAllGroups[category.key]
              const visibleItems = isExpanded ? items.slice(0, showAll ? items.length : 5) : []

              return (
                <section className="recommendation-category" key={category.key}>
                  <div className="recommendation-category-heading">
                    <button aria-expanded={isExpanded} className="recommendation-category-toggle" onClick={() => toggleGroup(category.key)} type="button">
                      {category.label} <span>{items.length}</span>
                    </button>
                    {isExpanded && items.length > 5 && (
                      <button className="subtle-button" onClick={() => toggleShowAll(category.key)} type="button">
                        {showAll ? 'Show less' : 'Show all'}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="recommendation-list">
                    {visibleItems.map((item) => {
                      const key = itemKey(item)
                      const aiRanked = item.ranking_source === 'ai'

                      return (
                        <label className={`recommendation-item${item.existing ? ' existing' : ''}`} key={key}>
                          <input
                            checked={selectedKeys.has(key)}
                            disabled={item.existing || (!selectedKeys.has(key) && selectedKeys.size >= maximumPreparedItems)}
                            onChange={() => toggleItem(item)}
                            type="checkbox"
                          />
                          <span className="recommendation-item-content">
                            <span className="recommendation-item-heading">
                              <strong>{item.term}</strong>
                              <span className="recommendation-type">{item.type === 'phrase' ? 'Phrase' : 'Word'}</span>
                              {item.cefr_level !== 'Unknown' && <span className="recommendation-cefr">CEFR {item.cefr_level}</span>}
                              {item.existing && <span className="recommendation-existing">Already in vocabulary</span>}
                            </span>
                            <span className="recommendation-ranking-label">
                              {aiRanked ? 'AI · ' : ''}{priorityLabel(aiRanked ? item.ai_priority : item.priority)}
                            </span>
                            <span className="recommendation-reason">{item.reason}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  )}
                </section>
              )
            })}
          </div>

          <button className="primary-button" disabled={!selectedItems.length || isPreparing} onClick={handlePrepareSelected} type="button">
            {isPreparing ? 'Preparing with Context…' : 'Prepare Selected Recommendations'}
          </button>
          {prepareError && <p className="message error-message" role="alert">{prepareError}</p>}
        </>
      )}

      {!isRanking && aiStatus && recommendations.length === 0 && (
        <p className="message notice-message">No suitable vocabulary candidates were found in this passage.</p>
      )}

      {showPrepared && preparedItems && preparedItems.length > 0 && (
        <div className="recommendation-prepared-items">
          <PreparedVocabularyCards initialItems={preparedItems} onVocabularyCreated={onVocabularyCreated} />
        </div>
      )}
    </section>
  )
}

export default VocabularyRecommendations
