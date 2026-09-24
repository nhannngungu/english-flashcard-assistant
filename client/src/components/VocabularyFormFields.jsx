import PronunciationButton from './PronunciationButton.jsx'

function VocabularyFormFields({ form, isLookingUp = false, onChange, onLookup, showPronunciation = false }) {
  return (
    <>
      <div className="form-field">
        <label htmlFor="word">Word <span aria-hidden="true">*</span></label>
        <div className="word-lookup-control">
          <input id="word" name="word" onChange={onChange} required value={form.word} />
          {onLookup && (
            <button className="secondary-button" disabled={isLookingUp || !form.word.trim()} onClick={onLookup} type="button">
              {isLookingUp ? 'Looking up…' : 'Look Up'}
            </button>
          )}
        </div>
        {showPronunciation && <PronunciationButton audioUrl={form.audio_url} word={form.word} />}
      </div>

      <div className="form-field">
        <label htmlFor="phonetic">Phonetic</label>
        <input id="phonetic" name="phonetic" onChange={onChange} value={form.phonetic} />
      </div>

      <div className="form-field">
        <label htmlFor="meaning_vi">Vietnamese Meaning</label>
        <textarea id="meaning_vi" name="meaning_vi" onChange={onChange} rows="2" value={form.meaning_vi} />
      </div>

      <div className="form-field">
        <label htmlFor="meaning_en">English Definition</label>
        <textarea id="meaning_en" name="meaning_en" onChange={onChange} rows="2" value={form.meaning_en} />
      </div>

      <div className="form-field">
        <label htmlFor="part_of_speech">Part of Speech</label>
        <input id="part_of_speech" name="part_of_speech" onChange={onChange} value={form.part_of_speech} />
      </div>

      <div className="form-field">
        <label htmlFor="example">Example</label>
        <textarea id="example" name="example" onChange={onChange} rows="3" value={form.example} />
      </div>

      <div className="form-field">
        <label htmlFor="audio_url">Audio URL</label>
        <input id="audio_url" name="audio_url" onChange={onChange} type="url" value={form.audio_url} />
      </div>

      <div className="form-field">
        <label htmlFor="image_url">Image URL</label>
        <input id="image_url" name="image_url" onChange={onChange} type="url" value={form.image_url} />
      </div>

      <div className="form-field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" onChange={onChange} value={form.status}>
          <option value="new">New</option>
          <option value="learning">Learning</option>
          <option value="learned">Learned</option>
        </select>
      </div>
    </>
  )
}

export default VocabularyFormFields
