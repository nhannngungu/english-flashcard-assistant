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
        {images.map((image) => {
          const isSelected = selectedUrl === image.image_url

          return (
            <button
              aria-label={`Use image: ${image.title}`}
              aria-pressed={isSelected}
              className={`image-suggestion-card${isSelected ? ' selected' : ''}`}
              key={`${image.source}-${image.id || image.image_url}`}
              onClick={() => onSelect(image)}
              type="button"
            >
              <img alt={image.title} loading="lazy" src={image.thumbnail_url} />
              <span className="image-suggestion-title">{image.title}</span>
              <span className="image-suggestion-credit">
                {[image.creator, image.license, image.source].filter(Boolean).join(' · ')}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export default ImageSuggestions
