import { apiRequest } from './client.js'

export function extractTextFromImage(image) {
  const formData = new FormData()
  formData.append('image', image)
  return apiRequest('import/ocr', { method: 'POST', body: formData }, { authenticated: false })
}
