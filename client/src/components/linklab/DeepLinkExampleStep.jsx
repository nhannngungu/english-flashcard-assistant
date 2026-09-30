export default function DeepLinkExampleStep({ choices, feedback, onChoose, word }) {
  return (
    <section className="linklab-example-step" aria-labelledby="linklab-example-title">
      <div className="linklab-deep-steps" aria-label="Deep Link progress"><span className="done">1 <b>Meaning</b> ✓</span><i /><span aria-current="step">2 <b>Example</b></span></div>
      <div className="linklab-chain-lead"><span>{word.word}</span><i>→</i><span>{word.meaning_vi}</span><i>→</i><b>?</b></div>
      <div>
        <small>Step 2 · Final link</small>
        <h4 id="linklab-example-title">Which example completes the chain?</h4>
      </div>
      <div className="linklab-example-choices">
        {choices.map((choice) => (
          <button
            className={feedback?.targetId === choice.id ? feedback.type : ''}
            key={choice.id}
            onClick={() => onChoose(choice)}
            type="button"
          >
            “{choice.example}”
          </button>
        ))}
      </div>
    </section>
  )
}
