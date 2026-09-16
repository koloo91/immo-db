export function useTheme() {
  const currentTheme = useState<'night' | 'emerald'>('app-theme', () => 'night')

  function setTheme(t: 'night' | 'emerald') {
    currentTheme.value = t
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t)
      try {
        localStorage.setItem('immo-theme', t)
      } catch {}
    }
  }

  function toggleTheme() {
    setTheme(currentTheme.value === 'night' ? 'emerald' : 'night')
  }

  function initTheme() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('immo-theme') as 'night' | 'emerald' | null
        if (saved && (saved === 'night' || saved === 'emerald')) {
          setTheme(saved)
          return
        }
      } catch {}
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'night' : 'emerald')
    }
  }

  return { currentTheme, setTheme, toggleTheme, initTheme }
}
