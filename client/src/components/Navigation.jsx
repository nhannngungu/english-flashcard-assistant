const navigationItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'add-words', label: 'Add Words' },
  { id: 'review', label: 'Review' },
]

function Navigation({ activePage, onNavigate }) {
  return (
    <nav className="navigation" aria-label="Main navigation">
      {navigationItems.map((item) => (
        <button
          className={activePage === item.id ? 'navigation-link active' : 'navigation-link'}
          aria-current={activePage === item.id ? 'page' : undefined}
          key={item.id}
          onClick={() => onNavigate(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export default Navigation
