export const LINKLAB_MODES = {
  classic: {
    title: 'Classic Link',
    description: 'Connect each English word to its Vietnamese meaning.',
    roundSize: 6,
  },
  deep: {
    title: 'Deep Link',
    description: 'Build a complete chain from word to meaning to example.',
    roundSize: 5,
  },
  visual: {
    title: 'Visual Link',
    description: 'Match vocabulary to the image that represents it.',
    roundSize: 6,
  },
  speed: {
    title: 'Speed Arena',
    description: 'Race the clock while keeping your accuracy and combo high.',
    roundSize: 6,
  },
}

export function shuffle(items, random = Math.random) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function eligibleWords(words, mode) {
  return (words || []).filter((item) => {
    const hasCore = Boolean(item?.word?.trim() && item?.meaning_vi?.trim())
    if (mode === 'deep') return hasCore && Boolean(item?.example?.trim())
    if (mode === 'visual') return Boolean(item?.word?.trim() && item?.image_url?.trim())
    return hasCore
  })
}

export function createRounds(words, size, random = Math.random) {
  const shuffled = shuffle(words, random)
  const rounds = []
  for (let index = 0; index < shuffled.length; index += size) {
    rounds.push(shuffled.slice(index, index + size))
  }
  return rounds
}

export function calculateAccuracy(totalLinks, mistakes) {
  const attempts = totalLinks + mistakes
  return attempts ? Math.round((totalLinks / attempts) * 100) : 0
}

export function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
