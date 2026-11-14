import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Info, SearchX, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { SearchBox } from '../components/SearchBox'
import { ProductCard } from '../components/ProductCard'
import { PreferencesPanel } from '../components/PreferencesPanel'
import { DEFAULT_WEIGHTS, ScoringPanel } from '../components/ScoringPanel'
import { DecisionAssistant } from '../components/DecisionAssistant'
import { EmptyState, ErrorState, ProductCardSkeleton, Skeleton, categoryIcon } from '../components/ui'
import { useAsync, useBrands, useCategories, useProducts } from '../hooks/useApi'
import { useApp } from '../context/AppContext'
import { api, ApiError, errorMessage } from '../lib/api'
import { cn, formatINR, formatINRShort } from '../lib/format'
import { basicSearchUrl, parsePrompt, searchUrl } from '../lib/prompt'
import type { AssistantContext, Criterion, PreferenceResponse, ProductQuery, RecommendationRequest, RecommendationSort, ShoppingPreferences, SortOption } from '../types/api'

// ---------------------------------------------------------------------------
// AI results are cached per request for this browser tab, so going back or
// changing a filter doesn't call the AI again.
// ---------------------------------------------------------------------------
interface AiCacheEntry {
  response: PreferenceResponse
  applied: boolean
  /** Preferences after the user's last validated edit (uses, priorities, guidelines) */
  appliedPreferences?: ShoppingPreferences
}
const aiCacheKey = (q: string) => `siftwell:ai:v1:${q}`
function readAiCache(q: string): AiCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(aiCacheKey(q))
    return raw ? (JSON.parse(raw) as AiCacheEntry) : null
  } catch {
    return null
  }
}
// Scoring weights are a per-browser preference
const WEIGHTS_KEY = 'siftwell:weights.v1'
function readWeights(): { weights: Record<Criterion, number>; adjust: boolean } {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return { weights: { ...DEFAULT_WEIGHTS, ...saved.weights }, adjust: saved.adjust !== false }
    }
  } catch {
    /* ignore */
  }
  return { weights: DEFAULT_WEIGHTS, adjust: true }
}

function writeAiCache(q: string, entry: AiCacheEntry) {
  try {
    sessionStorage.setItem(aiCacheKey(q), JSON.stringify(entry))
  } catch {
    /* storage unavailable — the result just won't be cached */
  }
}

const PAGE_SIZE = 12

const sorts: { id: SortOption | ''; label: string }[] = [
  { id: '', label: 'Best match' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name (A–Z)' },
]

const budgetPresets: { label: string; min?: number; max?: number }[] = [
  { label: 'Under ₹20k', max: 20000 },
  { label: '₹20k – ₹50k', min: 20000, max: 50000 },
  { label: '₹50k – ₹1L', min: 50000, max: 100000 },
  { label: 'Above ₹1L', min: 100000 },
]

const toNumber = (v: string | null) => {
  const n = Number(v)
  return v && Number.isFinite(n) && n > 0 ? n : undefined
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? undefined
  const brands = params.getAll('brand')
  const minPrice = toNumber(params.get('min'))
  const maxPrice = toNumber(params.get('max'))
  const sort = (params.get('sort') as SortOption | null) ?? undefined
  const [pages, setPages] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  const update = (patch: Record<string, string | string[] | null | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key)
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
      else if (value) next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  // --- AI mode: the backend extracts preferences, which become the filters ---
  const aiMode = params.get('ai') === '1' && q.trim().length >= 3
  const ai = useAsync(
    async (signal) => ({ q, response: readAiCache(q)?.response ?? (await api.aiPreferences(q, signal)) }),
    [q],
    aiMode,
  )
  const aiResponse = ai.data?.q === q ? ai.data.response : undefined
  const [appliedFor, setAppliedFor] = useState<string | null>(null)
  const [appliedPrefs, setAppliedPrefs] = useState<ShoppingPreferences | null>(null)
  const [weights, setWeights] = useState(() => readWeights().weights)
  const [adjustForUsage, setAdjustForUsage] = useState(() => readWeights().adjust)
  // Wait for slider movement to settle before re-scoring
  const [debouncedWeights, setDebouncedWeights] = useState(weights)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedWeights(weights), 300)
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify({ weights, adjust: adjustForUsage }))
    } catch {
      /* ignore */
    }
    return () => window.clearTimeout(t)
  }, [weights, adjustForUsage])

  const applySearch = (search: PreferenceResponse['search']) =>
    update({
      category: search.category,
      min: search.min_price ? String(search.min_price) : null,
      max: search.max_price ? String(search.max_price) : null,
      brand: search.brand,
    })

  // First result for a request: remember it and apply its filters once
  useEffect(() => {
    if (!aiMode || !aiResponse) return
    const cached = readAiCache(q)
    if (!cached?.applied) {
      writeAiCache(q, { response: aiResponse, applied: true })
      applySearch(aiResponse.search)
    }
    setAppliedPrefs(cached?.appliedPreferences ?? aiResponse.preferences)
    setAppliedFor(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode, aiResponse, q])

  // Edits are validated by the backend (Pydantic + catalogue check) before they affect results
  const applyEditedPreferences = async (prefs: ShoppingPreferences): Promise<{ error: string | null; warnings: string[] }> => {
    try {
      const validated = await api.validatePreferences(prefs)
      const cached = readAiCache(q)
      if (cached) writeAiCache(q, { ...cached, appliedPreferences: validated.preferences })
      setAppliedPrefs(validated.preferences)
      applySearch(validated.search)
      return { error: null, warnings: validated.warnings }
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const text = (err.details as { field: string; message: string }[]).map((d) => `${d.field || 'Preferences'}: ${d.message}`).join(' · ')
        return { error: text, warnings: [] }
      }
      return { error: errorMessage(err), warnings: [] }
    }
  }
  const waitingForAi = aiMode && appliedFor !== q
  // The panel shows the preferences currently in use (the user's validated edits, if any)
  const panelResponse = useMemo(
    () => (aiResponse && appliedPrefs ? { ...aiResponse, preferences: appliedPrefs } : aiResponse),
    [aiResponse, appliedPrefs],
  )

  // Record the search in the user's history once its filters are known (once per query)
  const { recordSearch } = useApp()
  useEffect(() => {
    if (!q.trim() || waitingForAi) return
    recordSearch(q, { category: category ?? null, min_price: minPrice ?? null, max_price: maxPrice ?? null, brands })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, waitingForAi])

  // Without AI: category and budget words are turned into filters, the rest is sent as keywords
  const keywords = useMemo(() => (aiMode ? [] : parsePrompt(q).keywords), [q, aiMode])
  const filterKey = JSON.stringify([q, category, brands, minPrice, maxPrice, sort])
  useEffect(() => setPages(1), [filterKey])

  const baseQuery: ProductQuery = { category, brand: brands, min_price: minPrice, max_price: maxPrice, sort, limit: PAGE_SIZE * pages }
  const primary = useProducts({ ...baseQuery, q: keywords.join(' ') || undefined }, !aiMode)

  // AI mode: rank products against the preferences (category/budget/brands come from the URL filters)
  const recommendationSort: RecommendationSort = sort === 'price_asc' || sort === 'price_desc' || sort === 'name' ? sort : 'match'
  const recQuery: RecommendationRequest | null =
    aiMode && !waitingForAi && appliedPrefs
      ? {
          preferences: {
            ...appliedPrefs,
            category: (category as ShoppingPreferences['category']) ?? null,
            min_budget_inr: minPrice ?? null,
            max_budget_inr: maxPrice ?? null,
            brands,
          },
          weights: debouncedWeights,
          adjust_for_usage: adjustForUsage,
          sort: recommendationSort,
          limit: PAGE_SIZE * pages,
          offset: 0,
        }
      : null
  const recKey = JSON.stringify(recQuery)
  const rec = useAsync((signal) => api.recommend(recQuery!, signal), [recKey], !!recQuery)
  const matchBySlug = new Map(rec.data?.items.map((i) => [i.product.slug, i]) ?? [])

  // Decision Assistant: the products currently shown (up to 8) plus the preferences and weights in use
  const assistantSlugs = rec.data?.items.slice(0, 8).map((i) => i.product.slug).join(',') ?? ''
  const assistantContext = useMemo<AssistantContext | null>(
    () =>
      recQuery && assistantSlugs
        ? { product_slugs: assistantSlugs.split(','), preferences: recQuery.preferences, weights: recQuery.weights, adjust_for_usage: recQuery.adjust_for_usage }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assistantSlugs, recKey],
  )

  // If the keywords match nothing, fall back to the category/budget filters alone
  const hasStructuredFilters = !!(category || brands.length || minPrice || maxPrice)
  const needFallback = !primary.loading && !primary.error && primary.data?.total === 0 && keywords.length > 0 && hasStructuredFilters
  const fallback = useProducts(baseQuery, needFallback)
  const usingFallback = needFallback && (fallback.data?.total ?? 0) > 0
  const active = aiMode
    ? { data: rec.data && { items: rec.data.items.map((i) => i.product), total: rec.data.total }, error: rec.error, loading: rec.loading, reload: rec.reload }
    : usingFallback
      ? fallback
      : primary
  const results = active.data
  const loading = waitingForAi || active.loading || (!aiMode && needFallback && fallback.loading)

  const categories = useCategories()
  const brandList = useBrands(category)
  const categoryName = categories.data?.find((c) => c.slug === category)?.name

  const [minInput, setMinInput] = useState('')
  const [maxInput, setMaxInput] = useState('')
  useEffect(() => {
    setMinInput(minPrice ? String(minPrice) : '')
    setMaxInput(maxPrice ? String(maxPrice) : '')
  }, [minPrice, maxPrice])
  const budgetInvalid = !!(minInput && maxInput && Number(minInput) > Number(maxInput))
  const applyBudget = (e: FormEvent) => {
    e.preventDefault()
    if (!budgetInvalid) update({ min: minInput || null, max: maxInput || null })
  }

  const activeChips = [
    category && { label: categoryName ?? category, clear: () => update({ category: null, brand: null }) },
    ...brands.map((b) => ({ label: b, clear: () => update({ brand: brands.filter((x) => x !== b) }) })),
    (minPrice || maxPrice) && {
      label: minPrice && maxPrice ? `${formatINRShort(minPrice)} – ${formatINRShort(maxPrice)}` : maxPrice ? `Under ${formatINRShort(maxPrice)}` : `Above ${formatINRShort(minPrice!)}`,
      clear: () => update({ min: null, max: null }),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  const clearAll = () => navigate('/app/search')

  const filters = (
    <div className="space-y-7">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Category</h3>
        <div className="mt-3 space-y-0.5">
          <button onClick={() => update({ category: null, brand: null })} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', !category ? 'bg-navy-50 font-medium text-navy-900' : 'text-slate-600 hover:bg-slate-100')}>
            <Sparkles className="h-4 w-4" /> All categories
          </button>
          {categories.loading && <Skeleton className="h-16 w-full" />}
          {categories.error && (
            <p className="px-2.5 py-2 text-xs text-rose-600">
              Couldn’t load categories. <button onClick={categories.reload} className="font-medium underline">Retry</button>
            </p>
          )}
          {categories.data?.map((c) => {
            const Icon = categoryIcon(c.slug)
            const on = category === c.slug
            return (
              <button key={c.slug} onClick={() => update({ category: on ? null : c.slug, brand: null })} aria-pressed={on} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', on ? 'bg-navy-50 font-medium text-navy-900' : 'text-slate-600 hover:bg-slate-100')}>
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-xs text-slate-400">{c.product_count}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Budget (INR)</h3>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {budgetPresets.map((p) => {
            const on = minPrice === p.min && maxPrice === p.max
            return (
              <button key={p.label} onClick={() => update({ min: on ? null : p.min?.toString(), max: on ? null : p.max?.toString() })} aria-pressed={on} className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium transition', on ? 'border-navy-800 bg-navy-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
                {p.label}
              </button>
            )
          })}
        </div>
        <form onSubmit={applyBudget} className="mt-3">
          <div className="flex items-center gap-2">
            <input type="number" min={0} step={1000} inputMode="numeric" value={minInput} onChange={(e) => setMinInput(e.target.value)} placeholder="Min ₹" aria-label="Minimum price in rupees" className="input px-2.5 py-1.5 text-xs" />
            <span className="text-slate-300">–</span>
            <input type="number" min={0} step={1000} inputMode="numeric" value={maxInput} onChange={(e) => setMaxInput(e.target.value)} placeholder="Max ₹" aria-label="Maximum price in rupees" className="input px-2.5 py-1.5 text-xs" />
          </div>
          {budgetInvalid && <p className="mt-1.5 text-xs text-rose-600">Minimum can’t be more than maximum.</p>}
          <button type="submit" disabled={budgetInvalid} className="btn-secondary mt-2 w-full py-1.5 text-xs">Apply budget</button>
        </form>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Brand</h3>
        <div className="mt-3 space-y-1">
          {brandList.loading && <Skeleton className="h-20 w-full" />}
          {brandList.error && (
            <p className="text-xs text-rose-600">
              Couldn’t load brands. <button onClick={brandList.reload} className="font-medium underline">Retry</button>
            </p>
          )}
          {brandList.data?.length === 0 && <p className="text-xs text-slate-400">No brands yet.</p>}
          {brandList.data?.map((b) => {
            const on = brands.some((x) => x.toLowerCase() === b.brand.toLowerCase())
            return (
              <label key={b.brand} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                <input type="checkbox" checked={on} onChange={() => update({ brand: on ? brands.filter((x) => x.toLowerCase() !== b.brand.toLowerCase()) : [...brands, b.brand] })} className="h-4 w-4 rounded border-slate-300 accent-navy-900" />
                <span className="flex-1">{b.brand}</span>
                <span className="text-xs text-slate-400">{b.product_count}</span>
              </label>
            )
          })}
        </div>
      </section>

      {activeChips.length > 0 && (
        <button onClick={() => update({ category: null, brand: null, min: null, max: null })} className="btn-ghost w-full text-xs">
          <X className="h-3.5 w-3.5" /> Reset filters
        </button>
      )}
    </div>
  )

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Product search</h1>
        <p className="mt-1 text-sm text-slate-500">Describe what you need — category, budget in rupees and must-have specs.</p>
      </div>
      <div className="mt-5">
        <SearchBox initial={q} size="md" onSearch={(v) => navigate(searchUrl(v), { replace: true })} autoFocus={!q && !category} placeholder="e.g. “laptop under ₹70,000 for Java development and gaming”" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block">{filters}</aside>

        <div className="min-w-0">
          {/* AI-extracted preferences (editable) */}
          {aiMode && (
            <div className="mb-5">
              <PreferencesPanel
                response={panelResponse}
                loading={ai.loading}
                error={ai.error ? errorMessage(ai.error) : undefined}
                onRetry={ai.reload}
                onUseBasic={() => navigate(basicSearchUrl(q), { replace: true })}
                onApply={applyEditedPreferences}
                current={{ category, min: minPrice, max: maxPrice, brands }}
              />
            </div>
          )}

          {/* How the prompt was understood (without AI) */}
          {q && !aiMode && (
            <div className="card mb-5 flex gap-3.5 p-4">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-900 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-slate-900">Searching for</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {keywords.map((k) => <span key={k} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">“{k}”</span>)}
                  {activeChips.map((c) => <span key={c.label} className="rounded-md bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-800">{c.label}</span>)}
                  {!keywords.length && !activeChips.length && <span className="text-xs text-slate-500">All products</span>}
                </div>
                <p className="mt-2 text-xs text-slate-400">Your prompt is matched against product names and specifications. AI ranking is coming soon.</p>
              </div>
            </div>
          )}

          {usingFallback && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>No products mention <strong>{keywords.map((k) => `“${k}”`).join(' ')}</strong>, so here are all matches for your other filters instead.</p>
            </div>
          )}

          {/* How products are scored (AI mode) */}
          {aiMode && !waitingForAi && !ai.error && (
            <ScoringPanel
              data={rec.data}
              weights={weights}
              onWeightsChange={setWeights}
              adjustForUsage={adjustForUsage}
              onAdjustChange={setAdjustForUsage}
              sortedByMatch={recommendationSort === 'match'}
            />
          )}

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-500" aria-live="polite">
                {loading ? 'Searching…' : results ? <><span className="font-medium text-slate-900">{results.total}</span> {results.total === 1 ? 'product' : 'products'}</> : null}
              </p>
              {!q && activeChips.map((c) => (
                <button key={c.label} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-slate-300">
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters((s) => !s)} className="btn-secondary py-2 text-xs lg:hidden" aria-expanded={showFilters}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeChips.length > 0 && ` (${activeChips.length})`}
              </button>
              <select value={sort ?? ''} onChange={(e) => update({ sort: e.target.value || null })} className="input w-auto py-2 pr-8 text-xs" aria-label="Sort results">
                {sorts.filter((s) => !aiMode || s.id !== 'newest').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {showFilters && <div className="card animate-fade-in mb-6 p-5 lg:hidden">{filters}</div>}

          {/* Results */}
          {aiMode && ai.error ? null : active.error ? (
            <ErrorState
              title="Couldn’t load products"
              message={errorMessage(active.error)}
              onRetry={() => {
                active.reload()
                if (categories.error) categories.reload()
                if (brandList.error) brandList.reload()
              }}
            />
          ) : waitingForAi || (loading && !results?.items.length) ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : !results || results.total === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching products"
              text={
                minPrice || maxPrice
                  ? `Nothing matches${maxPrice ? ` under ${formatINR(maxPrice)}` : ''}${minPrice ? ` above ${formatINR(minPrice)}` : ''}. Try a wider budget, fewer filters or different words.`
                  : 'Try different words, a broader category or fewer filters.'
              }
              action={<button onClick={clearAll} className="btn-secondary">Clear search and filters</button>}
            />
          ) : (
            <>
              <div className={cn('grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3', loading && 'opacity-60')}>
                {results.items.map((p, i) => (
                  <div key={p.slug} className="animate-fade-up grid" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <ProductCard product={p} match={aiMode ? matchBySlug.get(p.slug) : undefined} />
                  </div>
                ))}
              </div>
              {results.items.length < results.total && (
                <div className="mt-8 flex justify-center">
                  <button onClick={() => setPages((n) => n + 1)} disabled={loading} className="btn-secondary">
                    {loading ? 'Loading…' : `Load more (${results.total - results.items.length} left)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {aiMode && <DecisionAssistant context={assistantContext} storageKey={`siftwell:chat:v1:${q}`} />}
    </div>
  )
}
