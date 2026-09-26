function VocabularySetFields({
  title,
  coverImageUrl,
  onTitleChange,
  onCoverImageUrlChange,
  candidateImages = [],
  disabled = false,
  idPrefix = 'vocabulary-set',
}) {
  const uniqueImages = [...new Set(candidateImages.filter(Boolean))].slice(0, 5)

  return (
    <div className="vocabulary-set-fields">
      <div className="form-field">
        <label htmlFor={`${idPrefix}-title`}>Set title</label>
        <input
          disabled={disabled}
          id={`${idPrefix}-title`}
          maxLength="160"
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Vocabulary Set - DD/MM/YYYY"
          value={title}
        />
        <small>Leave blank to use today’s default title.</small>
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-cover`}>Cover image URL</label>
        <input
          disabled={disabled}
          id={`${idPrefix}-cover`}
          onChange={(event) => onCoverImageUrlChange(event.target.value)}
          placeholder="https://… (optional)"
          type="url"
          value={coverImageUrl}
        />
      </div>
      {uniqueImages.length > 0 && (
        <div className="vocabulary-set-cover-options" aria-label="Use a selected vocabulary image as the set cover">
          <span>Use a vocabulary image:</span>
          {uniqueImages.map((imageUrl) => (
            <button
              aria-pressed={coverImageUrl === imageUrl}
              className={coverImageUrl === imageUrl ? 'selected' : ''}
              disabled={disabled}
              key={imageUrl}
              onClick={() => onCoverImageUrlChange(imageUrl)}
              type="button"
            >
              <img alt="Set cover option" src={imageUrl} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default VocabularySetFields
