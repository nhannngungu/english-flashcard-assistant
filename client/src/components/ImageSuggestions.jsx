import { useState } from 'react'

function ImageSuggestionCard({ image, isSelected, onSelect }) {
  const [previewFailed, setPreviewFailed] = useState(false)

  return (
    <button
      aria-label={`Use image: ${image.title}`}
      aria-pressed={isSelected}
      className={`image-suggestion-card${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(image)}
      type="button"
    >
      {previewFailed ? (
        <span className="image-preview-unavailable">Preview unavailable</span>
      ) : (
        <img alt={image.title} loading="lazy" onError={() => setPreviewFailed(true)} src={image.thumbnail_url} />
      )}
      <span className="image-suggestion-title">{image.title}</span>
      <span className="image-suggestion-credit">
        {[image.creator, image.license, image.source].filter(Boolean).join(' · ')}
      </span>
    </button>
  )
}

function ImageSuggestions({ images, selectedUrl, onSelect }) {
  return (
    <>
      {images.some((image) => image.source === 'pexels') && (
        <p className="image-provider-attribution">
          <a href="https://www.pexels.com" rel="noreferrer" target="_blank">
            Photos provided by Pexels
          </a>
        </p>
      )}
      <div className="image-suggestion-grid">
        {images.map((image) => (
          <ImageSuggestionCard
            image={image}
            isSelected={selectedUrl === image.image_url}
            key={`${image.source}-${image.id || image.image_url}`}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  )
}

export default ImageSuggestions
