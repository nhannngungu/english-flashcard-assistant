import { useEffect, useId, useState } from 'react'

export default function LinkConnector({ containerRef, source, target, targetPoint, type = 'correct' }) {
  const [geometry, setGeometry] = useState({ height: 0, path: '', width: 0 })
  const gradientId = useId().replace(/:/g, '')
  const isWrong = type.includes('wrong')
  const isGuide = type.includes('guide')

  useEffect(() => {
    if (!source || (!target && !targetPoint) || !containerRef.current) return undefined
    const update = () => {
      const container = containerRef.current.getBoundingClientRect()
      const from = source.getBoundingClientRect()
      const x1 = from.right - container.left
      const y1 = from.top + from.height / 2 - container.top
      const to = target?.getBoundingClientRect()
      const x2 = targetPoint?.x ?? to.left - container.left
      const y2 = targetPoint?.y ?? to.top + to.height / 2 - container.top
      const curve = Math.max(48, Math.abs(x2 - x1) * 0.46)
      setGeometry({
        height: container.height,
        path: `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`,
        width: container.width,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(containerRef.current)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [containerRef, source, target, targetPoint?.x, targetPoint?.y])

  if (!geometry.path) return null
  return (
    <svg className={`linklab-connector ${type}`} aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1">
          <stop offset="0" stopColor={isWrong ? '#ef4444' : '#4f46e5'} />
          <stop offset="1" stopColor={isWrong ? '#fb7185' : isGuide ? '#8b5cf6' : '#10b981'} />
        </linearGradient>
      </defs>
      <path d={geometry.path} pathLength="1" stroke={`url(#${gradientId})`} />
    </svg>
  )
}
