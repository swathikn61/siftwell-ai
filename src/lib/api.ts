/**
 * Small typed client for the Siftwell FastAPI backend.
 *
 * - Every error becomes an `ApiError` with a friendly message.
 * - Products are cached by slug, so pages like Compare and Saved can show
 *   products instantly after they were loaded once in search results.
 */
import type { BrandCount, Category, Health, Product, ProductPage, ProductQuery } from '../types/api'

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

async function request<T>(path: string, options: { params?: Params; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(buildUrl(path, options.params), { signal: options.signal, headers: { Accept: 'application/json' } })
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
