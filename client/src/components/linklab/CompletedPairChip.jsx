export default function CompletedPairChip({ mode, word }) {
  const target = mode === 'visual' ? 'image linked' : word.meaning_vi
  return (
    <span className="linklab-completed-chip">
      <b aria-hidden="true">✓</b> {word.word} <i>·</i> {target}
      {mode === 'deep' && <><i>·</i><em>{word.example}</em></>}
    </span>
  )
}
