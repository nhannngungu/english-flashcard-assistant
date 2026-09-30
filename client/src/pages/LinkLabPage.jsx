import { useState } from 'react'
import { getRandomLinkLabSession } from '../api/linkLab.js'
import LinkLabArena from '../components/linklab/LinkLabArena.jsx'
import LinkLabModeSelector from '../components/linklab/LinkLabModeSelector.jsx'
import LinkLabProgress from '../components/linklab/LinkLabProgress.jsx'
import LinkLabStats from '../components/linklab/LinkLabStats.jsx'
import SessionSummary from '../components/linklab/SessionSummary.jsx'
import SpeedArena from '../components/linklab/SpeedArena.jsx'
import useLinkLabSession from '../hooks/useLinkLabSession.js'
import { LINKLAB_MODES } from '../utils/linkLab.js'
import '../styles/linklab.css'

export default function LinkLabPage({ onBack, vocabularySet }) {
  const [source, setSource] = useState(vocabularySet ? 'set' : 'all')
  const [filter, setFilter] = useState('all')
  const [sessionSize, setSessionSize] = useState(18)
  const [sourceError, setSourceError] = useState('')
  const [sourceNotice, setSourceNotice] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionLabel, setSessionLabel] = useState(vocabularySet?.title || 'All Vocabulary')
  const session = useLinkLabSession(vocabularySet?.words)

  function chooseSource(nextSource) {
    setSource(nextSource)
    setSourceError('')
    setSourceNotice('')
  }

  async function startMode(mode) {
    setSourceError('')
    setSourceNotice('')
    if (source === 'set') {
      setSessionLabel(vocabularySet.title)
      session.start(mode)
      return
    }

    setIsLoading(true)
    try {
      const result = await getRandomLinkLabSession({ limit: sessionSize, mode, status: filter })
      if (!result.items.length) {
        setSourceError(`No ${filter === 'all' ? '' : `${filter} `}vocabulary is usable for ${LINKLAB_MODES[mode].title}. Try another filter or mode.`)
        return
      }
      if (result.reduced) setSourceNotice(`Using all ${result.items.length} eligible ${result.items.length === 1 ? 'word' : 'words'} because fewer than ${sessionSize} are available.`)
      setSessionLabel(`All Vocabulary · ${filter === 'all' ? 'All statuses' : filter[0].toUpperCase() + filter.slice(1)}`)
      session.start(mode, result.items)
    } catch (requestError) {
      setSourceError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (session.status === 'selecting') {
    return <LinkLabModeSelector error={sourceError} filter={filter} isLoading={isLoading} notice={sourceNotice} onBack={onBack} onFilterChange={setFilter} onSizeChange={setSessionSize} onSourceChange={chooseSource} onStart={startMode} sessionSize={sessionSize} source={source} vocabularySet={vocabularySet} />
  }

  if (session.status === 'insufficient') {
    return <section className="linklab-empty"><span aria-hidden="true">◇</span><h3>Not enough matching material</h3><p>{session.mode === 'visual' ? 'Visual Link needs words with usable image URLs.' : session.mode === 'deep' ? 'Deep Link needs words with Vietnamese meanings and example sentences.' : 'This mode needs words with Vietnamese meanings.'}</p><button onClick={session.reset} type="button">Choose Another Mode</button></section>
  }

  if (session.status === 'complete') {
    return <SessionSummary backLabel={source === 'set' ? 'Back to Review Set' : 'New Random Session'} onBack={source === 'set' ? onBack : session.reset} onPracticeMistakes={(words) => session.start(session.mode, words)} session={session} />
  }

  return (
    <div className="linklab-session">
      <div className="linklab-session-topline"><button className="linklab-back" onClick={session.reset} type="button">← Modes</button><div><small>LINKLAB / {LINKLAB_MODES[session.mode].title.toUpperCase()}</small><strong>{sessionLabel}</strong></div></div>
      {sourceNotice && <p className="linklab-session-notice" role="status">{sourceNotice}</p>}
      <LinkLabProgress combo={session.combo} completed={session.completedIds.length} modeTitle={LINKLAB_MODES[session.mode].title} roundIndex={session.roundIndex} roundSize={session.currentRound.length} totalRounds={session.rounds.length} />
      {session.mode === 'speed' && <SpeedArena {...session} />}
      <LinkLabArena completedIds={session.completedIds} currentRound={session.currentRound} mode={session.mode} onComplete={session.completeWord} onWrong={session.recordWrong} targetOrder={session.targetOrder} />
      <LinkLabStats bestCombo={session.bestCombo} completedPairs={session.completedPairs} mistakes={session.mistakes} time={session.mode === 'speed' ? session.timeLeft : session.elapsedTime} timeLabel={session.mode === 'speed' ? 'Time left' : 'Time'} />
    </div>
  )
}
