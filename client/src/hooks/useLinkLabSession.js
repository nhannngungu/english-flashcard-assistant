import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRounds, eligibleWords, LINKLAB_MODES, shuffle } from '../utils/linkLab.js'

const SPEED_SECONDS = 60

export default function useLinkLabSession(words = []) {
  const [mode, setMode] = useState(null)
  const [rounds, setRounds] = useState([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [completedIds, setCompletedIds] = useState([])
  const [completedPairs, setCompletedPairs] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [mistakeCounts, setMistakeCounts] = useState({})
  const [elapsedTime, setElapsedTime] = useState(0)
  const [timeLeft, setTimeLeft] = useState(SPEED_SECONDS)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState('selecting')
  const advanceTimer = useRef(null)

  const currentRound = rounds[roundIndex] || []
  const targetOrder = useMemo(() => shuffle(currentRound), [currentRound])
  const activeWords = useMemo(() => rounds.flat(), [rounds])

  const start = useCallback((nextMode, practiceWords = null) => {
    const config = LINKLAB_MODES[nextMode]
    const pool = eligibleWords(practiceWords || words, nextMode)
    setMode(nextMode)
    setRounds(createRounds(pool, config.roundSize))
    setRoundIndex(0)
    setCompletedIds([])
    setCompletedPairs(0)
    setMistakes(0)
    setFirstTryCorrect(0)
    setCombo(0)
    setBestCombo(0)
    setMistakeCounts({})
    setElapsedTime(0)
    setTimeLeft(SPEED_SECONDS)
    setScore(0)
    setStatus(pool.length >= (practiceWords ? 1 : 2) ? 'playing' : 'insufficient')
  }, [words])

  const reset = useCallback(() => {
    clearTimeout(advanceTimer.current)
    setMode(null)
    setRounds([])
    setStatus('selecting')
  }, [])

  const recordWrong = useCallback((wordId) => {
    setMistakes((value) => value + 1)
    setCombo(0)
    setMistakeCounts((counts) => ({ ...counts, [wordId]: (counts[wordId] || 0) + 1 }))
  }, [])

  const completeWord = useCallback((wordId) => {
    if (completedIds.includes(wordId) || status !== 'playing') return
    const nextCompleted = [...completedIds, wordId]
    const nextCombo = combo + 1
    setCompletedIds(nextCompleted)
    setCompletedPairs((value) => value + 1)
    setCombo(nextCombo)
    setBestCombo((value) => Math.max(value, nextCombo))
    setScore((value) => value + 100 + Math.min(combo, 10) * 10)
    if (!mistakeCounts[wordId]) setFirstTryCorrect((value) => value + 1)

    if (nextCompleted.length !== currentRound.length) return
    clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(() => {
      if (roundIndex + 1 < rounds.length) {
        setRoundIndex((value) => value + 1)
        setCompletedIds([])
      } else if (mode === 'speed') {
        setRounds(createRounds(activeWords, LINKLAB_MODES.speed.roundSize))
        setRoundIndex(0)
        setCompletedIds([])
      } else {
        setStatus('complete')
      }
    }, 850)
  }, [activeWords, combo, completedIds, currentRound.length, mistakeCounts, mode, roundIndex, rounds.length, status])

  const finish = useCallback(() => setStatus('complete'), [])

  useEffect(() => {
    if (status !== 'playing') return undefined
    const interval = window.setInterval(() => setElapsedTime((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [status])

  useEffect(() => {
    if (status !== 'playing' || mode !== 'speed') return undefined
    const interval = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          setStatus('complete')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [mode, status])

  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  return {
    activeWords,
    bestCombo,
    combo,
    completeWord,
    completedIds,
    completedPairs,
    currentRound,
    elapsedTime,
    finish,
    firstTryCorrect,
    mistakeCounts,
    mistakes,
    mode,
    recordWrong,
    reset,
    roundIndex,
    rounds,
    score,
    start,
    status,
    targetOrder,
    timeLeft,
  }
}
