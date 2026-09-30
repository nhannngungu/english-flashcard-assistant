import { calculateAccuracy, formatElapsed } from '../../utils/linkLab.js'

export default function LinkLabStats({ bestCombo, completedPairs, mistakes, time, timeLabel = 'Time' }) {
  return (
    <dl className="linklab-stats">
      <div><dt>Accuracy</dt><dd>{calculateAccuracy(completedPairs, mistakes)}%</dd></div>
      <div><dt>Mistakes</dt><dd>{mistakes}</dd></div>
      <div><dt>Best combo</dt><dd>×{bestCombo}</dd></div>
      <div><dt>{timeLabel}</dt><dd>{formatElapsed(time)}</dd></div>
    </dl>
  )
}
