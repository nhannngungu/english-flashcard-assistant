const sentenceBoundaryPattern = /[.!?]/u

function skipClosingPunctuation(text, index) {
  let nextIndex = index
  while (nextIndex < text.length && /["'’”\])}]/u.test(text[nextIndex])) nextIndex += 1
  return nextIndex
}

export function extractContainingSentence(text, start, end) {
  if (typeof text !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)) return ''

  let sentenceStart = Math.max(0, Math.min(start, text.length))
  let sentenceEnd = Math.max(sentenceStart, Math.min(end, text.length))

  while (sentenceStart > 0) {
    const previousCharacter = text[sentenceStart - 1]
    if (sentenceBoundaryPattern.test(previousCharacter) || previousCharacter === '\n') break
    sentenceStart -= 1
  }

  while (sentenceEnd < text.length) {
    const character = text[sentenceEnd]
    sentenceEnd += 1
    if (sentenceBoundaryPattern.test(character) || character === '\n') {
      sentenceEnd = skipClosingPunctuation(text, sentenceEnd)
      break
    }
  }

  return text.slice(sentenceStart, sentenceEnd).trim()
}

export function extractSurroundingContext(text, start, end, radius = 180) {
  if (typeof text !== 'string') return ''
  const contextStart = Math.max(0, start - radius)
  const contextEnd = Math.min(text.length, end + radius)
  return text.slice(contextStart, contextEnd).trim()
}
