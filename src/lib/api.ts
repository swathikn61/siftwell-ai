/**
 * Small typed client for the Siftwell FastAPI backend.
 *
 * - Every error becomes an `ApiError` with a friendly message.
 * - Products are cached by slug, so pages like Compare and Saved can show
 *   products instantly after they were loaded once in search results.
 */
import type {
  AssistantContext, AssistantReply, BrandCount, Category, ChatTurn, Comparison, FavouriteApi, Health, PreferenceResponse, Product,
  ProductPage, ProductQuery, RecommendationRequest, RecommendationResponse, SavedComparisonApi, SearchHistoryEntry,
  ShoppingPreferences, TokenResponse, UserAccount, UserPreferencesApi,
} from '../types/api'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isNetwork() {
    return this.status === 0
  }

  get isNotFound() {
    return this.status === 404
  }
}

type Params = Record<string, string | number | boolean | string[] | undefined | null>

// ---------------------------------------------------------------------------
// Login token
//
// Kept in localStorage when "Keep me signed in" is ticked, otherwise in
// sessionStorage (cleared when the browser tab closes). Only the token is
// stored — never the password.
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'siftwell:token'
let unauthorizedHandler: (() => void) | null = null

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string, remember: boolean) {
    try {
      tokenStore.clear()
      ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
    } catch {
      /* storage blocked — the session lasts until reload */
    }
  },
  /** Replace the token in whichever storage currently holds it (e.g. after a password change). */
  replace(token: string) {
    try {
      const remembered = localStorage.getItem(TOKEN_KEY) !== null
      tokenStore.set(token, remembered)
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Called when a request made with a token gets 401 (expired or revoked session). */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

function buildUrl(path: string, params?: Params) {
  const url = new URL(API_URL + path)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) value.forEach((v) => v && url.searchParams.append(key, v))
      else url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(path: string, options: { params?: Params; signal?: AbortSignal; body?: unknown; method?: Method } = {}): Promise<T> {
  let res: Response
  const token = tokenStore.get()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    res = await fetch(buildUrl(path, options.params), {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      signal: options.signal,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network_error', `Can’t reach the Siftwell server. Make sure the backend is running at ${API_URL}.`)
  }

  if (!res.ok) {
    let code = 'http_error'
    let message = `Request failed (${res.status})`
    let details: unknown = null
    try {
      const body = await res.json()
      if (body?.error) {
        code = body.error.code ?? code
        message = body.error.message ?? message
        details = body.error.details ?? null
      }
    } catch {
      /* response was not JSON */
    }
    if (res.status >= 500 && code === 'http_error') message = 'The server had a problem. Please try again in a moment.'
    // A token was sent but rejected: the session has expired or been revoked
    // (only for code "unauthorized" — e.g. a wrong confirmation password is a 400, not a session problem)
    if (res.status === 401 && token && code === 'unauthorized' && !path.startsWith('/api/auth/login')) unauthorizedHandler?.()
    throw new ApiError(res.status, code, message, details)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Product cache (by slug)
// ---------------------------------------------------------------------------
const productCache = new Map<string, Product>()

function remember(products: Product[]) {
  products.forEach((p) => productCache.set(p.slug, p))
}

export function cachedProduct(slug: string): Product | undefined {
  return productCache.get(slug)
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
export const api = {
  health: (signal?: AbortSignal) => request<Health>('/api/health', { signal }),

  categories: (signal?: AbortSignal) => request<Category[]>('/api/categories', { signal }),

  brands: (category?: string, signal?: AbortSignal) =>
    request<BrandCount[]>('/api/products/brands', { params: { category }, signal }),

  /** Uses /search when there is a keyword, otherwise the plain list endpoint. */
  async products(query: ProductQuery, signal?: AbortSignal): Promise<ProductPage> {
    const { q, ...rest } = query
    const keyword = q?.trim()
    const page = keyword
      ? await request<ProductPage>('/api/products/search', { params: { q: keyword, ...rest }, signal })
      : await request<ProductPage>('/api/products', { params: rest, signal })
    remember(page.items)
    return page
  },

  /** Rule-based comparison of 1–4 products (by slug). */
  async compare(slugs: string[], signal?: AbortSignal): Promise<Comparison> {
    const result = await request<Comparison>('/api/compare', { params: { products: slugs }, signal })
    remember(result.products)
    return result
  },

  /** AI preference extraction (the Gemini API key stays on the backend). */
  aiPreferences: (query: string, signal?: AbortSignal) =>
    request<PreferenceResponse>('/api/ai/preferences', { body: { query }, signal }),

  /** Validate preferences the user edited; returns the matching search filters. */
  validatePreferences: (preferences: ShoppingPreferences, signal?: AbortSignal) =>
    request<PreferenceResponse>('/api/ai/preferences/validate', { body: preferences, signal }),

  /** Rule-based ranking of products against validated preferences, with explanations. */
  async recommend(body: RecommendationRequest, signal?: AbortSignal): Promise<RecommendationResponse> {
    const result = await request<RecommendationResponse>('/api/recommendations', { body, signal })
    remember(result.items.map((i) => i.product))
    return result
  },

  /** Ask the Decision Assistant about the products in `context` (answers are grounded in backend data). */
  assistantChat: (question: string, context: AssistantContext, history: ChatTurn[], signal?: AbortSignal) =>
    request<AssistantReply>('/api/assistant/chat', { body: { question, context, history }, signal }),

  // --- Accounts ----------------------------------------------------------
  register: (name: string, email: string, password: string) =>
    request<TokenResponse>('/api/auth/register', { body: { name, email, password } }),
  login: (email: string, password: string) => request<TokenResponse>('/api/auth/login', { body: { email, password } }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => request<void>('/api/auth/logout-all', { method: 'POST' }),
  me: (signal?: AbortSignal) => request<UserAccount>('/api/auth/me', { signal }),
  updateProfile: (patch: { name?: string; location?: string; currency?: string; preferences?: UserPreferencesApi }) =>
    request<UserAccount>('/api/users/me', { method: 'PATCH', body: patch }),
  changePassword: (current_password: string, new_password: string) =>
    request<TokenResponse>('/api/users/me/password', { body: { current_password, new_password } }),
  deleteAccount: (password: string) => request<void>('/api/users/me', { method: 'DELETE', body: { password } }),

  // --- My data -------------------------------------------------------------
  comparisons: (signal?: AbortSignal) => request<SavedComparisonApi[]>('/api/me/comparisons', { signal }),
  createComparison: (title: string, product_slugs: string[], note?: string) =>
    request<SavedComparisonApi>('/api/me/comparisons', { body: { title, product_slugs, note } }),
  updateComparison: (id: number, patch: { title?: string; note?: string | null; product_slugs?: string[] }) =>
    request<SavedComparisonApi>(`/api/me/comparisons/${id}`, { method: 'PATCH', body: patch }),
  deleteComparison: (id: number) => request<void>(`/api/me/comparisons/${id}`, { method: 'DELETE' }),

  async favourites(signal?: AbortSignal): Promise<FavouriteApi[]> {
    const items = await request<FavouriteApi[]>('/api/me/favourites', { signal })
    remember(items.map((f) => f.product))
    return items
  },
  addFavourite: (slug: string) => request<FavouriteApi>(`/api/me/favourites/${encodeURIComponent(slug)}`, { method: 'PUT' }),
  removeFavourite: (slug: string) => request<void>(`/api/me/favourites/${encodeURIComponent(slug)}`, { method: 'DELETE' }),

  history: (signal?: AbortSignal) => request<SearchHistoryEntry[]>('/api/me/history', { signal }),
  addHistory: (query: string, filters: SearchHistoryEntry['filters']) =>
    request<SearchHistoryEntry>('/api/me/history', { body: { query, filters } }),
  deleteHistory: (id: number) => request<void>(`/api/me/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => request<void>('/api/me/history', { method: 'DELETE' }),

  async productBySlug(slug: string, signal?: AbortSignal): Promise<Product> {
    const product = await request<Product>(`/api/products/slug/${encodeURIComponent(slug)}`, { signal })
    remember([product])
    return product
  },
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}
