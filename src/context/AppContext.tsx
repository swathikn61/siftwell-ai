import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, errorMessage, onUnauthorized, tokenStore } from '../lib/api'
import type { SavedComparisonApi, SearchHistoryEntry, TokenResponse, UserAccount, UserPreferencesApi } from '../types/api'

/**
 * App-wide state.
 *
 * - Accounts are real: the backend issues a signed token on login/registration,
 *   and the session is restored from it on page load.
 * - Saved comparisons, favourite products, search history, profile and
 *   preferences are stored on the server, per user.
 * - The compare tray is temporary and stays in this browser.
 */
export type User = UserAccount

export interface Preferences {
  budgetMin: number
  budgetMax: number
  categories: string[]
  priorities: string[]
  emailDigest: boolean
  priceAlerts: boolean
}

export interface SavedComparison {
  id: string
  title: string
  productSlugs: string[]
  createdAt: string
  note?: string | null
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

interface Toast {
  id: number
  message: string
}

interface AppState {
  user: User | null
  authStatus: AuthStatus
  login: (email: string, password: string, remember: boolean) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Called after a password change: keep this device signed in with the new token */
  applyToken: (res: TokenResponse) => void
  updateUser: (patch: { name?: string; location?: string; currency?: string }) => Promise<void>
  preferences: Preferences
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>
  /** Backend product slugs */
  compareIds: string[]
  toggleCompare: (id: string) => void
  setCompare: (ids: string[]) => void
  clearCompare: () => void
  /** Favourite products (backend slugs) */
  savedProductIds: string[]
  favouritesState: LoadState
  toggleSavedProduct: (slug: string) => Promise<void>
  savedComparisons: SavedComparison[]
  comparisonsState: LoadState
  saveComparison: (title: string, productSlugs: string[]) => Promise<SavedComparison>
  deleteComparison: (id: string) => Promise<void>
  renameComparison: (id: string, title: string) => Promise<void>
  searchHistory: SearchHistoryEntry[]
  historyState: LoadState
  recordSearch: (query: string, filters: SearchHistoryEntry['filters']) => void
  deleteSearch: (id: number) => Promise<void>
  clearSearchHistory: () => Promise<void>
  reloadUserData: () => void
  toasts: Toast[]
  notify: (message: string) => void
}

export const MAX_COMPARE = 4

const AppContext = createContext<AppState | null>(null)

const DEFAULT_PREFS: UserPreferencesApi = {
  budget_min: 0,
  budget_max: 150000,
  categories: ['laptops', 'smartphones'],
  priorities: ['Battery life', 'Build quality', 'Value for money'],
  email_digest: true,
  price_alerts: true,
}

const toPreferences = (p: UserPreferencesApi | undefined): Preferences => {
  const v = { ...DEFAULT_PREFS, ...(p ?? {}) }
  return { budgetMin: v.budget_min, budgetMax: v.budget_max, categories: v.categories, priorities: v.priorities, emailDigest: v.email_digest, priceAlerts: v.price_alerts }
}

const toApiPreferences = (p: Preferences): UserPreferencesApi => ({
  budget_min: p.budgetMin,
  budget_max: p.budgetMax,
  categories: p.categories.filter((c): c is 'laptops' | 'smartphones' => c === 'laptops' || c === 'smartphones'),
  priorities: p.priorities,
  email_digest: p.emailDigest,
  price_alerts: p.priceAlerts,
})

const toComparison = (c: SavedComparisonApi): SavedComparison => ({
  id: String(c.id),
  title: c.title,
  productSlugs: c.product_slugs,
  createdAt: c.created_at,
  note: c.note,
})

function loadCompare(): string[] {
  try {
    const raw = localStorage.getItem('siftwell:compare.v2')
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (tokenStore.get() ? 'checking' : 'anonymous'))
  const [compareIds, setCompareIds] = useState<string[]>(loadCompare)
  const [savedProductIds, setSavedProductIds] = useState<string[]>([])
  const [favouritesState, setFavouritesState] = useState<LoadState>('idle')
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([])
  const [comparisonsState, setComparisonsState] = useState<LoadState>('idle')
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([])
  const [historyState, setHistoryState] = useState<LoadState>('idle')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dataNonce, setDataNonce] = useState(0)
  const lastRecorded = useRef<string>('')

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('siftwell:compare.v2', JSON.stringify(compareIds))
    } catch {
      /* ignore */
    }
  }, [compareIds])

  const resetSession = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setAuthStatus('anonymous')
    setSavedProductIds([])
    setSavedComparisons([])
    setSearchHistory([])
    setFavouritesState('idle')
    setComparisonsState('idle')
    setHistoryState('idle')
    lastRecorded.current = ''
  }, [])

  // Expired/revoked token on any request -> sign out
  useEffect(() => {
    onUnauthorized(() => {
      resetSession()
      notify('Your session has ended. Please log in again.')
    })
    return () => onUnauthorized(null)
  }, [resetSession, notify])

  // Restore the session from a stored token
  useEffect(() => {
    if (!tokenStore.get()) return
    const controller = new AbortController()
    api
      .me(controller.signal)
      .then((u) => {
        setUser(u)
        setAuthStatus('authenticated')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        // A network error isn't a reason to drop the token; a 401 already reset the session
        if (tokenStore.get()) {
          setAuthStatus('anonymous')
          notify(errorMessage(err))
        }
      })
    return () => controller.abort()
  }, [notify])

  // Load the user's data once signed in
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    const controller = new AbortController()
    const { signal } = controller
    setFavouritesState('loading')
    setComparisonsState('loading')
    setHistoryState('loading')
    api.favourites(signal).then((f) => { setSavedProductIds(f.map((x) => x.product.slug)); setFavouritesState('ready') }).catch(() => !signal.aborted && setFavouritesState('error'))
    api.comparisons(signal).then((c) => { setSavedComparisons(c.map(toComparison)); setComparisonsState('ready') }).catch(() => !signal.aborted && setComparisonsState('error'))
    api.history(signal).then((h) => { setSearchHistory(h); setHistoryState('ready') }).catch(() => !signal.aborted && setHistoryState('error'))
    return () => controller.abort()
  }, [authStatus, user?.id, dataNonce])

  const startSession = useCallback((res: TokenResponse, remember: boolean) => {
    tokenStore.set(res.access_token, remember)
    setUser(res.user)
    setAuthStatus('authenticated')
  }, [])

  const value = useMemo<AppState>(
    () => ({
      user,
      authStatus,
      login: async (email, password, remember) => {
        startSession(await api.login(email, password), remember)
      },
      register: async (name, email, password) => {
        startSession(await api.register(name, email, password), true)
      },
      logout: async () => {
        try {
          await api.logout()
        } catch {
          /* the token is discarded either way */
        }
        resetSession()
      },
      applyToken: (res) => {
        tokenStore.replace(res.access_token)
        setUser(res.user)
      },
      updateUser: async (patch) => {
        setUser(await api.updateProfile(patch))
      },
      preferences: toPreferences(user?.preferences),
      updatePreferences: async (patch) => {
        const next = { ...toPreferences(user?.preferences), ...patch }
        setUser(await api.updateProfile({ preferences: toApiPreferences(next) }))
      },
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
      favouritesState,
      toggleSavedProduct: async (slug) => {
        const saved = savedProductIds.includes(slug)
        // Optimistic update, rolled back if the server says no
        setSavedProductIds((ids) => (saved ? ids.filter((x) => x !== slug) : [slug, ...ids]))
        try {
          if (saved) await api.removeFavourite(slug)
          else await api.addFavourite(slug)
          notify(saved ? 'Removed from saved products' : 'Saved to your products')
        } catch (err) {
          setSavedProductIds((ids) => (saved ? [slug, ...ids.filter((x) => x !== slug)] : ids.filter((x) => x !== slug)))
          notify(`Couldn’t update saved products: ${errorMessage(err)}`)
        }
      },
      savedComparisons,
      comparisonsState,
      saveComparison: async (title, productSlugs) => {
        const created = toComparison(await api.createComparison(title, productSlugs))
        setSavedComparisons((list) => [created, ...list])
        notify('Comparison saved')
        return created
      },
      deleteComparison: async (id) => {
        const before = savedComparisons
        setSavedComparisons((list) => list.filter((c) => c.id !== id))
        try {
          await api.deleteComparison(Number(id))
          notify('Comparison deleted')
        } catch (err) {
          setSavedComparisons(before)
          notify(`Couldn’t delete: ${errorMessage(err)}`)
        }
      },
      renameComparison: async (id, title) => {
        const updated = toComparison(await api.updateComparison(Number(id), { title }))
        setSavedComparisons((list) => list.map((c) => (c.id === id ? updated : c)))
      },
      searchHistory,
      historyState,
      recordSearch: (query, filters) => {
        const key = `${query}|${JSON.stringify(filters)}`
        if (!query.trim() || lastRecorded.current === key) return
        lastRecorded.current = key
        api
          .addHistory(query, filters)
          .then((entry) => setSearchHistory((list) => [entry, ...list.filter((h) => h.id !== entry.id)].slice(0, 50)))
          .catch(() => {
            /* history is best-effort; searching still works */
          })
      },
      deleteSearch: async (id) => {
        await api.deleteHistory(id)
        setSearchHistory((list) => list.filter((h) => h.id !== id))
      },
      clearSearchHistory: async () => {
        await api.clearHistory()
        setSearchHistory([])
      },
      reloadUserData: () => setDataNonce((n) => n + 1),
      toasts,
      notify,
    }),
    [user, authStatus, compareIds, savedProductIds, favouritesState, savedComparisons, comparisonsState, searchHistory, historyState, toasts, notify, resetSession, startSession],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
