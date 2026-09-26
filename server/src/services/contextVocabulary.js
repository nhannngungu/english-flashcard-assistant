import { lookupDictionaryCandidates } from '../routes/dictionary.js'
import { chooseContextualExample, rankContextualSenses } from './contextSenseRanking.js'
import { translateEnglishToVietnamese } from './translation.js'

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function responseBase(item, existing) {
  return {
    word: cleanText(item.word),
    normalized: cleanText(item.normalized).toLocaleLowerCase('en-US'),
    cefr_level: cleanText(item.cefr_level) || 'Unknown',
    sentence: cleanText(item.sentence),
    surrounding_context: cleanText(item.surrounding_context),
    existing,
  }
}

function publicSense(candidate, sentence) {
  const selectedExample = chooseContextualExample(candidate, sentence)

  return {
    part_of_speech: cleanText(candidate.part_of_speech),
    meaning_en: cleanText(candidate.definition),
    example: selectedExample.example,
    example_source: selectedExample.exampleSource,
    source: cleanText(candidate.source),
  }
}

export async function prepareContextVocabularyItem(item, { existing = false } = {}) {
  const base = responseBase(item, existing)
  const lookup = await lookupDictionaryCandidates(base.normalized)

  if (lookup.type !== 'success' || lookup.data.candidates.length === 0) {
    return {
      ...base,
      status: 'failed',
      error: lookup.type === 'not-found'
        ? `No dictionary senses were found for “${base.word}”.`
        : 'Dictionary services did not return usable senses. Please retry.',
      alternatives: [],
    }
  }

  const ranking = rankContextualSenses({
    candidates: lookup.data.candidates,
    normalizedWord: base.normalized,
    sentence: base.sentence,
    word: base.word,
  })
  const selectedCandidate = ranking.ranked[0]
  const selectedSense = publicSense(selectedCandidate, base.sentence)
  const translation = await translateEnglishToVietnamese(selectedSense.meaning_en)

  return {
    ...base,
    status: 'prepared',
    phonetic: cleanText(lookup.data.phonetic),
    audio_url: cleanText(lookup.data.audio_url),
    ...selectedSense,
    meaning_vi: translation.meaningVi,
    translation_source: translation.source,
    sense_confidence: ranking.confidence,
    ambiguous: ranking.ambiguous,
    ambiguity_message: ranking.ambiguous ? 'Meaning may be ambiguous' : '',
    alternatives: ranking.ranked.slice(1, 4).map((candidate) => publicSense(candidate, base.sentence)),
  }
}
