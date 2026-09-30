import { forwardRef } from 'react'

const LinkNode = forwardRef(function LinkNode({ children, feedback, isSelected, isTargetActive, onClick, onDrag, onDragEnd, onDragStart, onDrop, side }, ref) {
  return (
    <button
      aria-pressed={isSelected || undefined}
      className={`linklab-node ${isSelected ? 'selected' : ''} ${isTargetActive ? 'target-active' : ''} ${feedback || ''}`}
      draggable={side === 'source'}
      onClick={onClick}
      onDragOver={side === 'target' ? (event) => event.preventDefault() : undefined}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDrop={onDrop}
      ref={ref}
      type="button"
    >
      {children}
      {isSelected && <span className="linklab-selected-label">Selected</span>}
      <span className="linklab-node-dot" aria-hidden="true" />
    </button>
  )
})

export default LinkNode
