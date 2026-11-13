import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SearchX, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { SearchBox } from '../components/SearchBox'
import { ProductCard } from '../components/ProductCard'
import { DemoBadge, EmptyState, categoryIcons } from '../components/ui'
import { categories, type CategoryId } from '../data/demo'
import { parseQuery, rankProducts, summarise } from '../lib/search'
import { cn, formatPrice } from '../lib/format'

type Sort = 'relevance' | 'price-asc' | 'price-desc' | 'rating'

const sorts: { id: Sort; label: string }[] = [
  { id: 'relevance', label: 'Best match' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
]

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const categoryParam = params.get('category') as CategoryId | null
  const sort = (params.get('sort') as Sort) ?? 'relevance'
  const maxPrice = Number(params.get('max')) || 2000
  const minRating = Number(params.get('rating')) || 0
  const [thinking, setThinking] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)))
    setParams(next, { replace: true })
  }

  // Simulated AI latency whenever the prompt changes
  useEffect(() => {
    if (!q) return
    setThinking(true)
    const t = window.setTimeout(() => setThinking(false), 650)
    return () => window.clearTimeout(t)
  }, [q])

  const parsed = useMemo(() => parseQuery(q), [q])
  const activeCategory = categoryParam ?? parsed.category
  const results = useMemo(() => {
    const ranked = rankProducts({ ...parsed, category: activeCategory ?? undefined })
    const filtered = ranked.filter((r) => r.product.price <= maxPrice && r.product.rating >= minRating)
    const sorted = [...filtered]
    if (sort === 'price-asc') sorted.sort((a, b) => a.product.price - b.product.price)
    if (sort === 'price-desc') sorted.sort((a, b) => b.product.price - a.product.price)
    if (sort === 'rating') sorted.sort((a, b) => b.product.rating - a.product.rating)
    return sorted
  }, [parsed, activeCategory, maxPrice, minRating, sort])

  const hasFilters = !!categoryParam || maxPrice < 2000 || minRating > 0

  const filters = (
    <div className="space-y-7">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Category</h3>
        <div className="mt-3 space-y-0.5">
          <button onClick={() => update({ category: null })} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', !categoryParam ? 'bg-navy-50 font-medium text-navy-900' : 'text-slate-600 hover:bg-slate-100')}>
            <Sparkles className="h-4 w-4" /> All categories
          </button>
          {categories.map((c) => {
            const Icon = categoryIcons[c.id]
            const active = categoryParam === c.id
            return (
              <button key={c.id} onClick={() => update({ category: active ? null : c.id })} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', active ? 'bg-navy-50 font-medium text-navy-900' : 'text-slate-600 hover:bg-slate-100')}>
                <Icon className="h-4 w-4" /> {c.name}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Max price</h3>
          <span className="text-sm font-medium text-slate-900">{maxPrice >= 2000 ? 'Any' : formatPrice(maxPrice)}</span>
        </div>
        <input
          type="range" min={100} max={2000} step={50} value={maxPrice}
          onChange={(e) => update({ max: e.target.value === '2000' ? null : e.target.value })}
          className="mt-4 w-full accent-navy-900" aria-label="Maximum price"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-400"><span>$100</span><span>$2,000+</span></div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Minimum rating</h3>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[0, 4, 4.5, 4.7].map((r) => (
            <button key={r} onClick={() => update({ rating: r ? String(r) : null })} className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium transition', minRating === r ? 'border-navy-800 bg-navy-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
              {r ? `${r}+` : 'Any'}
            </button>
          ))}
        </div>
      </div>
      {hasFilters && (
        <button onClick={() => update({ category: null, max: null, rating: null })} className="btn-ghost w-full text-xs">
          <X className="h-3.5 w-3.5" /> Reset filters
        </button>
      )}
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Product search</h1>
          <p className="mt-1 text-sm text-slate-500">Describe your needs in plain language — budget, use case and must-haves.</p>
        </div>
        <DemoBadge label="Demo catalogue · simulated AI" />
      </div>
      <div className="mt-5">
        <SearchBox initial={q} size="md" onSearch={(v) => update({ q: v })} autoFocus={!q && !categoryParam} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">{filters}</aside>

        <div className="min-w-0">
          {/* AI summary */}
          {q && (
            <div className="card mb-6 flex gap-4 border-navy-100 bg-gradient-to-b from-navy-50/60 to-white p-5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-900 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Siftwell AI</p>
                {thinking ? (
                  <div className="mt-2 space-y-2" aria-label="Analysing">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{summarise({ ...parsed, category: activeCategory ?? undefined }, results)}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {activeCategory && <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">Category: {categories.find((c) => c.id === activeCategory)?.name}</span>}
                      {parsed.budget && <span className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">Budget: ≤ {formatPrice(parsed.budget)}</span>}
                      {parsed.keywords.slice(0, 4).map((k) => (
                        <span key={k} className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">{k}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-900">{thinking ? '—' : results.length}</span> results
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters((s) => !s)} className="btn-secondary py-2 text-xs lg:hidden" aria-expanded={showFilters}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{hasFilters && ' •'}
              </button>
              <select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} className="input w-auto py-2 pr-8 text-xs" aria-label="Sort results">
                {sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {showFilters && <div className="card animate-fade-in mb-6 p-5 lg:hidden">{filters}</div>}

          {thinking ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card h-[360px] animate-pulse bg-slate-100/60" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching products"
              text="Try raising your budget, lowering the minimum rating or choosing another category."
              action={<button onClick={() => navigate('/app/search')} className="btn-secondary">Clear search</button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((r, i) => (
                <div key={r.product.id} className="animate-fade-up grid" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <ProductCard product={r.product} reasons={q ? r.reasons : undefined} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
