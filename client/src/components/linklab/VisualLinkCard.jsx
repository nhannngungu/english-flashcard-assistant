import { forwardRef, useState } from 'react'

const VisualLinkCard = forwardRef(function VisualLinkCard({ className = '', label, ...buttonProps }, ref) {
  const [failed, setFailed] = useState(false)
  return (
    <button className={`linklab-visual-card ${className}`} ref={ref} type="button" {...buttonProps}>
      {!failed && buttonProps['data-image']
        ? <img alt="Vocabulary matching choice" onError={() => setFailed(true)} src={buttonProps['data-image']} />
        : <span className="linklab-image-fallback" aria-label="Image unavailable">Image unavailable</span>}
      {label && <span>{label}</span>}
    </button>
  )
})

export default VisualLinkCard
