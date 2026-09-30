import { formatElapsed } from '../../utils/linkLab.js'

export default function SpeedArena({ bestCombo, combo, completedPairs, score, timeLeft }) {
  const timeProgress = Math.max(0, Math.min(100, (timeLeft / 60) * 100))
  return (
    <section className={`linklab-speed-strip ${timeLeft <= 10 ? 'urgent' : ''}`} aria-label="Speed Arena score" style={{ '--time-progress': `${timeProgress}%` }}>
      <div className="linklab-speed-timer"><span aria-hidden="true" /><div><small>Time left</small><strong>{formatElapsed(timeLeft)}</strong></div></div>
      <div><small>Score</small><strong className="linklab-score-value" key={score}>{score.toLocaleString()}</strong></div>
      <div className={combo >= 3 ? 'hot' : ''}><small>Combo</small><strong key={combo}>×{combo}</strong></div>
      <div><small>Best</small><strong>×{bestCombo}</strong></div>
      <div><small>Linked</small><strong>{completedPairs}</strong></div>
    </section>
  )
}
