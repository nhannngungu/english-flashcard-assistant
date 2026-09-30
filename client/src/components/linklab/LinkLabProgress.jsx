export default function LinkLabProgress({ combo, completed, modeTitle, roundIndex, roundSize, totalRounds }) {
  const roundProgress = roundSize ? completed / roundSize : 0
  const progress = totalRounds ? ((roundIndex + roundProgress) / totalRounds) * 100 : 0
  return (
    <div className="linklab-progress">
      <div><small>Mode</small><strong>{modeTitle}</strong></div>
      <div className="linklab-progress-track-wrap">
        <span><b>Round {roundIndex + 1}</b> of {totalRounds}<em>{completed}/{roundSize} linked</em></span>
        <div className="linklab-progress-track"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className={`linklab-combo ${combo > 1 ? 'active' : ''} ${combo >= 3 ? 'hot' : ''}`} aria-live="polite"><small>Combo</small><strong key={combo}>×{combo}</strong></div>
    </div>
  )
}
