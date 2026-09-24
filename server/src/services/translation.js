const translationEndpoint = 'https://api.mymemory.translated.net/get'
const requestTimeoutMilliseconds = 8000
const maximumTextBytes = 500

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanVietnameseMeaning(value) {
  const cleanedMeaning = cleanText(value)
    .replace(
      /^\((?:(?:Anh|Mỹ|Hoa Kỳ|Canada|Ấn Độ|Úc|New Zealand|cổ xưa|lỗi thời|hiếm|phương ngữ)(?:,\s*)?)+\)\s*/i,
      '',
    )
    .replace(/^(?:Một|Để)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()

  return cleanedMeaning
    ? `${cleanedMeaning.charAt(0).toUpperCase()}${cleanedMeaning.slice(1)}`
    : ''
}

function fitsProviderLimit(text) {
  return Buffer.byteLength(text, 'utf8') <= maximumTextBytes
}

function translationFailure(reason) {
  console.warn(`[translation] mymemory.translated.net failed: ${reason}`)

  return {
    meaningVi: '',
    source: '',
  }
}

export async function translateEnglishToVietnamese(meaningEn) {
  const text = cleanText(meaningEn).replace(/[.!?]+$/, '')

  if (!text) {
    return { meaningVi: '', source: '' }
  }

  if (!fitsProviderLimit(text)) {
    return translationFailure(`text exceeds the ${maximumTextBytes}-byte request limit`)
  }

  const url = new URL(translationEndpoint)
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', 'en|vi')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMilliseconds)

  try {
    const providerResponse = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!providerResponse.ok) {
      return translationFailure(`HTTP ${providerResponse.status}`)
    }

    let data

    try {
      data = await providerResponse.json()
    } catch {
      return translationFailure('invalid JSON response')
    }

    if (Number(data?.responseStatus) >= 400) {
      return translationFailure(`provider status ${data.responseStatus}`)
    }

    const meaningVi = cleanVietnameseMeaning(data?.responseData?.translatedText)

    if (!meaningVi) {
      return translationFailure('response contained no translated text')
    }

    return {
      meaningVi,
      source: 'mymemory.translated.net',
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return translationFailure(`timed out after ${requestTimeoutMilliseconds}ms`)
    }

    return translationFailure(`network error: ${error.message}`)
  } finally {
    clearTimeout(timeoutId)
  }
}
