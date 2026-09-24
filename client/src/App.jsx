import { useState } from 'react'
import Navigation from './components/Navigation.jsx'
import AddWordsPage from './pages/AddWordsPage.jsx'
import VocabularyPage from './pages/VocabularyPage.jsx'

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [vocabularyRefreshKey, setVocabularyRefreshKey] = useState(0)

  function handleVocabularyCreated() {
    setVocabularyRefreshKey((currentKey) => currentKey + 1)
  }

  let pageContent

  if (activePage === 'vocabulary') {
    pageContent = <VocabularyPage refreshKey={vocabularyRefreshKey} />
  } else if (activePage === 'add-words') {
    pageContent = <AddWordsPage onVocabularyCreated={handleVocabularyCreated} />
  } else if (activePage === 'review') {
    pageContent = <p className="message">Review will be added in a future step.</p>
  } else {
    pageContent = <p className="message">Welcome! Start by adding a vocabulary word.</p>
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>English Flashcard Assistant</h1>
        <Navigation activePage={activePage} onNavigate={setActivePage} />
      </header>
      <main className="page-content">
        <h2>{activePage === 'add-words' ? 'Add Words' : activePage[0].toUpperCase() + activePage.slice(1)}</h2>
        {pageContent}
      </main>
    </div>
  )
}

export default App
