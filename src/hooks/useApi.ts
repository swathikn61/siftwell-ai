import { useCallback, useEffect, useMemo, useState, type DependencyList } from 'react'
import { api, ApiError, cachedProduct } from '../lib/api'
import type { BrandCount, Category, Product, ProductPage, ProductQuery } from '../types/api'

export interface AsyncState<T> {
  data: T | undefined
  error: ApiError | Error | undefined
  loading: boolean
  reload: () => void
}

/**
 * Run an async request when `deps` change. Older requests are cancelled, so a
 * slow response can never overwrite a newer one.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList, enabled = true): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError | Error>()
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    fn(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload }
}

export function useCategories(): AsyncState<Category[]> {
  return useAsync((signal) => api.categories(signal), [])
}

export function useBrands(category?: string): AsyncState<BrandCount[]> {
  return useAsync((signal) => api.brands(category, signal), [category])
}

export function useProducts(query: ProductQuery, enabled = true): AsyncState<ProductPage> {
  const key = JSON.stringify(query)
  return useAsync((signal) => api.products(query, signal), [key], enabled)
}

export function useProduct(slug: string | undefined): AsyncState<Product> {
  return useAsync((signal) => api.productBySlug(slug!, signal), [slug], !!slug)
}

/**
 * Load several products by slug (used by Compare, Saved and the dashboard).
 * Cached products appear instantly; products that no longer exist are listed
 * in `missing` instead of failing the whole request.
 */
export function useProductsBySlugs(slugs: string[]) {
  const key = slugs.join(',')
  const state = useAsync(
    async (signal) => {
      const results = await Promise.all(
        slugs.map(async (slug) => {
          const cached = cachedProduct(slug)
          if (cached) return { slug, product: cached }
          try {
            return { slug, product: await api.productBySlug(slug, signal) }
          } catch (err) {
            if (err instanceof ApiError && err.isNotFound) return { slug, product: undefined }
            throw err
          }
        }),
      )
      return results
    },
    [key],
    slugs.length > 0,
  )

  const bySlug = useMemo(() => {
    const map = new Map<string, Product>()
    state.data?.forEach((r) => r.product && map.set(r.slug, r.product))
    // Show cached products immediately, even while other slugs are loading
    slugs.forEach((s) => {
      const cached = cachedProduct(s)
      if (cached && !map.has(s)) map.set(s, cached)
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, key])

  const missing = state.data?.filter((r) => !r.product).map((r) => r.slug) ?? []
  const products = slugs.map((s) => bySlug.get(s)).filter((p): p is Product => !!p)
  return { ...state, products, bySlug, missing, loading: state.loading && products.length < slugs.length }
}
