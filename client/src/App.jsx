import { useState } from 'react'
import Navigation from './components/Navigation.jsx'
import AddWordsPage from './pages/AddWordsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ImportPage from './pages/ImportPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import VocabularyPage from './pages/VocabularyPage.jsx'

const pageTitles = {
  dashboard: 'Dashboard',
  vocabulary: 'Vocabulary',
  'add-words': 'Add Words',
  import: 'Import',
  review: 'Review',
}

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
  } else if (activePage === 'import') {
    pageContent = <ImportPage onVocabularyCreated={handleVocabularyCreated} />
  } else if (activePage === 'review') {
    pageContent = <ReviewPage />
  } else {
    pageContent = <DashboardPage onNavigate={setActivePage} />
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>English Flashcard Assistant</h1>
        <Navigation activePage={activePage} onNavigate={setActivePage} />
      </header>
      <main className="page-content">
        <h2>{pageTitles[activePage]}</h2>
        {pageContent}
      </main>
    </div>
  )
}

export default App
