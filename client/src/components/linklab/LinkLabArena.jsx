import { useEffect, useMemo, useRef, useState } from 'react'
import { shuffle } from '../../utils/linkLab.js'
import CompletedPairChip from './CompletedPairChip.jsx'
import DeepLinkExampleStep from './DeepLinkExampleStep.jsx'
import LinkConnector from './LinkConnector.jsx'
import LinkNode from './LinkNode.jsx'
import VisualLinkCard from './VisualLinkCard.jsx'

export default function LinkLabArena({ completedIds, currentRound, mode, onComplete, onWrong, targetOrder }) {
  const [selectedId, setSelectedId] = useState(null)
  const [deepWord, setDeepWord] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [locked, setLocked] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragPoint, setDragPoint] = useState(null)
  const containerRef = useRef(null)
  const centerRef = useRef(null)
  const sourceRefs = useRef(new Map())
  const targetRefs = useRef(new Map())
  const timerRef = useRef(null)
  const remaining = currentRound.filter((word) => !completedIds.includes(word.id))
  const currentMobileWord = remaining[0]
  const exampleChoices = useMemo(() => shuffle(currentRound), [currentRound])

  useEffect(() => {
    setSelectedId(null)
    setDeepWord(null)
    setFeedback(null)
    setLocked(false)
    setDraggingId(null)
    setDragPoint(null)
    return () => clearTimeout(timerRef.current)
  }, [currentRound])

  function selectSource(word) {
    if (locked || deepWord) return
    setSelectedId(word.id)
    setFeedback(null)
  }

  function moveDrag(event) {
    if (!event.clientX || !containerRef.current) return
    const container = containerRef.current.getBoundingClientRect()
    setDragPoint({ x: event.clientX - container.left, y: event.clientY - container.top })
  }

  function matchTarget(target, forcedSourceId = selectedId) {
    if (!forcedSourceId || locked || deepWord) return
    const source = currentRound.find((word) => String(word.id) === String(forcedSourceId))
    if (!source) return
    const correct = String(source.id) === String(target.id)
    setDraggingId(null)
    setDragPoint(null)
    setFeedback({ sourceId: source.id, targetId: target.id, type: correct ? 'correct' : 'wrong' })
    setLocked(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setLocked(false)
      setSelectedId(null)
      setFeedback(null)
      if (!correct) return onWrong(source.id)
      if (mode === 'deep') setDeepWord(source)
      else onComplete(source.id)
    }, correct ? 430 : 360)
  }

  function matchExample(choice) {
    if (locked || !deepWord) return
    const correct = String(choice.id) === String(deepWord.id)
    setFeedback({ targetId: choice.id, type: correct ? 'correct' : 'wrong' })
    setLocked(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setLocked(false)
      setFeedback(null)
      if (!correct) return onWrong(deepWord.id)
      const completedId = deepWord.id
      setDeepWord(null)
      onComplete(completedId)
    }, correct ? 430 : 360)
  }

  const connectorSource = feedback ? sourceRefs.current.get(feedback.sourceId) : null
  const connectorTarget = feedback ? targetRefs.current.get(feedback.targetId) : null
  const selectedSource = sourceRefs.current.get(draggingId || selectedId)

  if (deepWord) {
    return (
      <>
        <DeepLinkExampleStep choices={exampleChoices} feedback={feedback} onChoose={matchExample} word={deepWord} />
        {completedIds.length > 0 && <section className="linklab-completed" aria-live="polite"><small>Completed this round</small><div>{completedIds.map((id) => <CompletedPairChip key={id} mode={mode} word={currentRound.find((word) => word.id === id)} />)}</div></section>}
      </>
    )
  }

  return (
    <>
      <section className="linklab-arena" ref={containerRef} aria-label="Matching arena">
        <div className="linklab-arena-labels"><span>Words</span><span>Make the connection</span><span>{mode === 'visual' ? 'Images' : 'Meanings'}</span></div>
        <div className="linklab-desktop-board">
          <div className="linklab-node-column">
            {remaining.map((word, index) => (
              <LinkNode
                feedback={feedback?.sourceId === word.id ? feedback.type : ''}
                isSelected={selectedId === word.id}
                key={word.id}
                onClick={() => selectSource(word)}
                onDrag={moveDrag}
                onDragEnd={() => { setDraggingId(null); setDragPoint(null) }}
                onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(word.id)); setDraggingId(word.id); selectSource(word) }}
                ref={(node) => node ? sourceRefs.current.set(word.id, node) : sourceRefs.current.delete(word.id)}
                side="source"
              >
                <small>{String(index + 1).padStart(2, '0')}</small><strong>{word.word}</strong>
              </LinkNode>
            ))}
          </div>
          <div className={`linklab-connector-space ${selectedId ? 'active' : ''}`}>
            <div className="linklab-connection-core" ref={centerRef} aria-hidden="true"><i /><i /><i /><span>Connect</span></div>
          </div>
          <div className={`linklab-node-column ${mode === 'visual' ? 'visual-targets' : ''} ${selectedId ? 'targets-active' : ''}`}>
            {targetOrder.filter((word) => !completedIds.includes(word.id)).map((word) => mode === 'visual' ? (
              <VisualLinkCard
                aria-label={`Match image choice to ${selectedId ? 'selected word' : 'a word'}`}
                className={feedback?.targetId === word.id ? feedback.type : ''}
                data-image={word.image_url}
                key={word.id}
                onClick={() => matchTarget(word)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); matchTarget(word, event.dataTransfer.getData('text/plain')) }}
                ref={(node) => node ? targetRefs.current.set(word.id, node) : targetRefs.current.delete(word.id)}
              />
            ) : (
              <LinkNode
                feedback={feedback?.targetId === word.id ? feedback.type : ''}
                isTargetActive={Boolean(selectedId)}
                key={word.id}
                onClick={() => matchTarget(word)}
                onDrop={(event) => { event.preventDefault(); matchTarget(word, event.dataTransfer.getData('text/plain')) }}
                ref={(node) => node ? targetRefs.current.set(word.id, node) : targetRefs.current.delete(word.id)}
                side="target"
              >
                <strong>{word.meaning_vi}</strong>
              </LinkNode>
            ))}
          </div>
        </div>

        <div className="linklab-mobile-board">
          {currentMobileWord && !deepWord && (
            <>
              <div className="linklab-mobile-prompt"><small>Match this word</small><strong>{currentMobileWord.word}</strong></div>
              <div className={`linklab-mobile-options ${mode === 'visual' ? 'visual' : ''}`}>
                {targetOrder.filter((word) => !completedIds.includes(word.id)).map((word) => mode === 'visual' ? (
                  <VisualLinkCard
                    aria-label={`Choose image for ${currentMobileWord.word}`}
                    data-image={word.image_url}
                    key={word.id}
                    onClick={() => matchTarget(word, currentMobileWord.id)}
                  />
                ) : (
                  <button
                    className={feedback?.targetId === word.id ? feedback.type : ''}
                    key={word.id}
                    onClick={() => matchTarget(word, currentMobileWord.id)}
                    type="button"
                  >{word.meaning_vi}</button>
                ))}
              </div>
            </>
          )}
        </div>
        {connectorSource && connectorTarget && <LinkConnector containerRef={containerRef} source={connectorSource} target={connectorTarget} type={feedback.type} />}
        {!feedback && selectedSource && dragPoint && <LinkConnector containerRef={containerRef} source={selectedSource} targetPoint={dragPoint} type="guide dragging" />}
        {!feedback && selectedSource && !dragPoint && centerRef.current && <LinkConnector containerRef={containerRef} source={selectedSource} target={centerRef.current} type="guide" />}
      </section>

      {completedIds.length > 0 && (
        <section className="linklab-completed" aria-live="polite">
          <small>Completed this round</small>
          <div>{completedIds.map((id) => <CompletedPairChip key={id} mode={mode} word={currentRound.find((word) => word.id === id)} />)}</div>
        </section>
      )}
    </>
  )
}
