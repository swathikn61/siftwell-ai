import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoSavedComparisons, demoSavedProductIds, demoUser, type SavedComparison } from '../data/demo'

/**
 * Frontend-only app state. Authentication is simulated and everything is kept in
 * localStorage until the backend exists.
 */
export interface User {
  name: string
  email: string
  plan: string
  location: string
  currency: string
}

export interface Preferences {
  budgetMin: number
  budgetMax: number
  categories: string[]
  priorities: string[]
  emailDigest: boolean
  priceAlerts: boolean
}

interface Toast {
  id: number
  message: string
}

interface AppState {
  user: User | null
  login: (email: string, name?: string) => void
  logout: () => void
  updateUser: (patch: Partial<User>) => void
  preferences: Preferences
  updatePreferences: (patch: Partial<Preferences>) => void
  compareIds: string[]
  toggleCompare: (id: string) => void
  setCompare: (ids: string[]) => void
  clearCompare: () => void
  savedProductIds: string[]
  toggleSavedProduct: (id: string) => void
  savedComparisons: SavedComparison[]
  saveComparison: (title: string, productIds: string[]) => SavedComparison
  deleteComparison: (id: string) => void
  renameComparison: (id: string, title: string) => void
  toasts: Toast[]
  notify: (message: string) => void
}

export const MAX_COMPARE = 4

const AppContext = createContext<AppState | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`siftwell:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  useEffect(() => {
    try {
      localStorage.setItem(`siftwell:${key}`, JSON.stringify(value))
    } catch {
      /* storage unavailable — keep in memory only */
    }
  }, [key, value])
  return [value, setValue] as const
}

const defaultPreferences: Preferences = {
  budgetMin: 200,
  budgetMax: 1500,
  categories: ['laptops', 'headphones'],
  priorities: ['Battery life', 'Build quality', 'Value for money'],
  emailDigest: true,
  priceAlerts: true,
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = usePersisted<User | null>('user', null)
  const [preferences, setPreferences] = usePersisted<Preferences>('preferences', defaultPreferences)
  const [compareIds, setCompareIds] = usePersisted<string[]>('compare', [])
  const [savedProductIds, setSavedProductIds] = usePersisted<string[]>('savedProducts', demoSavedProductIds)
  const [savedComparisons, setSavedComparisons] = usePersisted<SavedComparison[]>('comparisons', demoSavedComparisons)
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  const value = useMemo<AppState>(
    () => ({
      user,
      login: (email, name) => {
        const derived = name?.trim() || (email.split('@')[0] || 'there').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        setUser({ ...demoUser, email, name: email === demoUser.email ? demoUser.name : derived })
      },
      logout: () => setUser(null),
      updateUser: (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
      preferences,
      updatePreferences: (patch) => setPreferences((p) => ({ ...p, ...patch })),
      compareIds,
      toggleCompare: (id) => {
        if (compareIds.includes(id)) {
          setCompareIds(compareIds.filter((x) => x !== id))
        } else if (compareIds.length >= MAX_COMPARE) {
          notify(`You can compare up to ${MAX_COMPARE} products at once`)
        } else {
          setCompareIds([...compareIds, id])
        }
      },
      setCompare: (ids) => setCompareIds(ids.slice(0, MAX_COMPARE)),
      clearCompare: () => setCompareIds([]),
      savedProductIds,
      toggleSavedProduct: (id) => {
        const saved = savedProductIds.includes(id)
        setSavedProductIds(saved ? savedProductIds.filter((x) => x !== id) : [id, ...savedProductIds])
        notify(saved ? 'Removed from saved products' : 'Saved to your products')
      },
      savedComparisons,
      saveComparison: (title, productIds) => {
        const c: SavedComparison = { id: `cmp-${Date.now()}`, title, productIds, createdAt: new Date().toISOString() }
        setSavedComparisons((list) => [c, ...list])
        notify('Comparison saved')
        return c
      },
      deleteComparison: (id) => {
        setSavedComparisons((list) => list.filter((c) => c.id !== id))
        notify('Comparison deleted')
      },
      renameComparison: (id, title) => setSavedComparisons((list) => list.map((c) => (c.id === id ? { ...c, title } : c))),
      toasts,
      notify,
    }),
    [user, preferences, compareIds, savedProductIds, savedComparisons, toasts, notify, setUser, setPreferences, setCompareIds, setSavedProductIds, setSavedComparisons],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
