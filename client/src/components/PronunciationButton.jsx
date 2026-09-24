import { useEffect, useRef, useState } from 'react'

function supportsSpeechSynthesis() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  )
}

function PronunciationButton({ audioUrl = '', word = '' }) {
  const audioRef = useRef(null)
  const playRequestRef = useRef(0)
  const [error, setError] = useState('')
  const trimmedWord = word.trim()

  function stopPlayback() {
    if (audioRef.current) {
      try {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      } catch {
        // The browser can reject cleanup for an audio file that never loaded.
      }

      audioRef.current = null
    }

    if (supportsSpeechSynthesis()) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // Some browsers expose the API but cannot start speech playback.
      }
    }
  }

  useEffect(() => stopPlayback, [])

  function speakWord(requestId) {
    if (!supportsSpeechSynthesis()) {
      setError('Pronunciation is unavailable in this browser.')
      return
    }

    try {
      const speechSynthesis = window.speechSynthesis
      const utterance = new window.SpeechSynthesisUtterance(trimmedWord)
      const englishVoice = speechSynthesis
        .getVoices()
        .find((voice) => /^en(?:[-_]|$)/i.test(voice.lang))

      utterance.lang = 'en-US'
      utterance.rate = 0.9

      if (englishVoice) {
        utterance.voice = englishVoice
        utterance.lang = englishVoice.lang
      }

      utterance.onerror = (event) => {
        if (playRequestRef.current === requestId && event.error !== 'canceled') {
          setError('Pronunciation could not be played. Please try again.')
        }
      }

      speechSynthesis.cancel()
      speechSynthesis.speak(utterance)
    } catch {
      setError('Pronunciation is unavailable in this browser.')
    }
  }

  function handleListen() {
    if (!trimmedWord) {
      return
    }

    const requestId = playRequestRef.current + 1
    playRequestRef.current = requestId
    setError('')
    stopPlayback()

    if (!audioUrl.trim()) {
      speakWord(requestId)
      return
    }

    let hasFallenBack = false
    const useSpeechFallback = () => {
      if (hasFallenBack || playRequestRef.current !== requestId) {
        return
      }

      hasFallenBack = true
      audioRef.current = null
      speakWord(requestId)
    }

    try {
      const audio = new Audio(audioUrl.trim())
      audioRef.current = audio
      audio.addEventListener('error', useSpeechFallback, { once: true })
      audio.addEventListener(
        'ended',
        () => {
          if (playRequestRef.current === requestId) {
            audioRef.current = null
          }
        },
        { once: true },
      )

      Promise.resolve(audio.play()).catch(useSpeechFallback)
    } catch {
      useSpeechFallback()
    }
  }

  return (
    <div className="pronunciation-control">
      <button
        aria-label={`Listen to ${trimmedWord || 'the word'}`}
        className="secondary-button"
        disabled={!trimmedWord}
        onClick={handleListen}
        type="button"
      >
        Listen
      </button>
      {error && <p className="pronunciation-error" role="alert">{error}</p>}
    </div>
  )
}

export default PronunciationButton
