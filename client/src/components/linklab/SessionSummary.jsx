import { calculateAccuracy, formatElapsed } from '../../utils/linkLab.js'

export default function SessionSummary({ backLabel = 'Back to Review Set', onBack, onPracticeMistakes, session }) {
  const practiceWords = session.activeWords
    .filter((word) => session.mistakeCounts[word.id])
    .sort((a, b) => session.mistakeCounts[b.id] - session.mistakeCounts[a.id])
  const accuracy = calculateAccuracy(session.completedPairs, session.mistakes)
  return (
    <section className="linklab-summary">
      <div className="linklab-summary-hero">
        <div className="linklab-accuracy-ring" style={{ '--accuracy': `${accuracy * 3.6}deg` }}><strong>{accuracy}%</strong><span>accuracy</span></div>
        <div><span className="linklab-eyebrow">Session complete</span><h3>Connections made.</h3><p>You completed the lab without changing your Smart Review schedule.</p></div>
      </div>
      <dl className="linklab-summary-grid">
        <div><dt>Total links</dt><dd>{session.completedPairs}</dd></div>
        <div><dt>First-try correct</dt><dd>{session.firstTryCorrect}</dd></div>
        <div><dt>Mistakes</dt><dd>{session.mistakes}</dd></div>
        <div><dt>Best combo</dt><dd>×{session.bestCombo}</dd></div>
        <div><dt>Total time</dt><dd>{formatElapsed(session.elapsedTime)}</dd></div>
      </dl>

      <div className="linklab-practice-list">
        <div><h4>Words to practice</h4><span>{practiceWords.length}</span></div>
        {practiceWords.length ? (
          <ul>{practiceWords.map((word) => <li key={word.id}><span>{word.word}<small>{word.meaning_vi}</small></span><b>{session.mistakeCounts[word.id]} {session.mistakeCounts[word.id] === 1 ? 'miss' : 'misses'}</b></li>)}</ul>
        ) : <p>Perfect run — no missed words this time.</p>}
      </div>
      <div className="linklab-summary-actions">
        <button className="linklab-secondary" onClick={onBack} type="button">{backLabel}</button>
        <button disabled={!practiceWords.length} onClick={() => onPracticeMistakes(practiceWords)} type="button">Practice Mistakes <span aria-hidden="true">→</span></button>
      </div>
    </section>
  )
}
