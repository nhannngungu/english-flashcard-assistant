import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthContext.jsx'
import Navigation from './components/Navigation.jsx'
import UserProfileCard from './components/UserProfileCard.jsx'
import AddWordsPage from './pages/AddWordsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ImportPage from './pages/ImportPage.jsx'
import LinkLabPage from './pages/LinkLabPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import VocabularyPage from './pages/VocabularyPage.jsx'

const pageTitles = {
  dashboard: 'Dashboard',
  vocabulary: 'Vocabulary',
  'add-words': 'Add Words',
  import: 'Import',
  review: 'Review',
  linklab: 'LinkLab',
}

function App() {
  const { user, loading } = useAuth()
  const [authPage, setAuthPage] = useState('login')
  const [activePage, setActivePage] = useState('dashboard')
  const [vocabularyRefreshKey, setVocabularyRefreshKey] = useState(0)
  const [reviewInitialMode, setReviewInitialMode] = useState('smart')
  const [linkLabSet, setLinkLabSet] = useState(null)

  function handleVocabularyCreated() {
    setVocabularyRefreshKey((currentKey) => currentKey + 1)
  }

  function handleNavigate(page, reviewMode = 'smart') {
    if (page === 'review') setReviewInitialMode(reviewMode)
    setActivePage(page)
  }

  function openLinkLab(vocabularySet) {
    setLinkLabSet(vocabularySet)
    setActivePage('linklab')
  }

  useEffect(() => {
    if (!user) setActivePage('dashboard')
  }, [user])

  if (loading) {
    return <main className="auth-shell"><div className="auth-card"><p>Restoring your session…</p></div></main>
  }

  if (!user) {
    return authPage === 'register'
      ? <RegisterPage onShowLogin={() => setAuthPage('login')} />
      : <LoginPage onShowRegister={() => setAuthPage('register')} />
  }

  let pageContent

  if (activePage === 'vocabulary') {
    pageContent = <VocabularyPage refreshKey={vocabularyRefreshKey} />
  } else if (activePage === 'add-words') {
    pageContent = <AddWordsPage onVocabularyCreated={handleVocabularyCreated} />
  } else if (activePage === 'import') {
    pageContent = <ImportPage onVocabularyCreated={handleVocabularyCreated} />
  } else if (activePage === 'review') {
    pageContent = <ReviewPage initialMode={reviewInitialMode} onOpenLinkLab={openLinkLab} />
  } else if (activePage === 'linklab') {
    pageContent = <LinkLabPage onBack={() => handleNavigate('review', 'sets')} vocabularySet={linkLabSet} />
  } else {
    pageContent = <DashboardPage onNavigate={handleNavigate} />
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-heading">
          <h1>English Flashcard Assistant</h1>
          <UserProfileCard />
        </div>
        <Navigation activePage={activePage} onNavigate={handleNavigate} />
      </header>
      <main className="page-content">
        <h2>{pageTitles[activePage]}</h2>
        {pageContent}
      </main>
    </div>
  )
}

export default App
