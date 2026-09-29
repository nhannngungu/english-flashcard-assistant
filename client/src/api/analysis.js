import { apiRequest } from './client.js'

export const analyzeCefrText = (text) => apiRequest('analysis/cefr', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
})
export const getVocabularyRecommendations = (text, learnerPreferences, useAi = false) => apiRequest('analysis/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, learner_preferences: learnerPreferences, use_ai: useAi }),
})
export const prepareVocabularyFromContext = (items) => apiRequest('analysis/prepare-vocabulary', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
})
export const translatePreparedDefinition = (meaningEn) => apiRequest('analysis/translate-definition', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meaning_en: meaningEn }),
})
