import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, Check, Clock, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { EmptyState, ErrorState, ProductThumb, Skeleton } from '../components/ui'
import { useProductsBySlugs } from '../hooks/useApi'
import { errorMessage } from '../lib/api'
import { cn, formatDate, formatINR } from '../lib/format'

type Tab = 'all' | 'recent' | 'notes'

export default function SavedPage() {
  const { savedComparisons, deleteComparison, renameComparison, setCompare } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Load every product referenced by any saved comparison (cached ones appear instantly)
  const allSlugs = useMemo(() => [...new Set(savedComparisons.flatMap((c) => c.productSlugs))], [savedComparisons])
  const { bySlug, loading, error, reload } = useProductsBySlugs(allSlugs)

  const list = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
    return savedComparisons
      .filter((c) => (tab === 'recent' ? new Date(c.createdAt).getTime() >= weekAgo : tab === 'notes' ? !!c.note : true))
      .filter((c) => {
        const q = query.toLowerCase().trim()
        if (!q) return true
        const names = c.productSlugs.map((slug) => bySlug.get(slug)?.name ?? '').join(' ')
        return `${c.title} ${names}`.toLowerCase().includes(q)
      })
  }, [savedComparisons, tab, query, bySlug])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'recent', label: 'Last 7 days' },
    { id: 'notes', label: 'With notes' },
  ]

  return (
    <div onClick={() => setMenu(null)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Saved comparisons</h1>
          <p className="mt-1 text-sm text-slate-500">{savedComparisons.length} saved in this browser · open one to keep researching</p>
        </div>
        <Link to="/app/search" className="btn-primary"><Search className="h-4 w-4" /> New search</Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-soft" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn('rounded-lg px-3.5 py-1.5 text-sm font-medium transition', tab === t.id ? 'bg-navy-900 text-white shadow-soft' : 'text-slate-600 hover:text-slate-900')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved comparisons" className="input pl-9" aria-label="Search saved comparisons" />
        </div>
      </div>

      {error && <div className="mt-6"><ErrorState compact title="Couldn’t load product details" message={errorMessage(error)} onRetry={reload} /></div>}

      <div className="mt-6">
        {list.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={savedComparisons.length ? 'No matches' : 'No saved comparisons'}
            text={savedComparisons.length ? 'Try a different search or tab.' : 'Compare products and press “Save comparison” to keep them here.'}
            action={<Link to="/app/search" className="btn-primary">Find products</Link>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((c) => {
              const items = c.productSlugs.map((slug) => bySlug.get(slug)).filter((p) => !!p)
              const unavailable = loading ? 0 : c.productSlugs.length - items.length
              const prices = items.map((p) => Number(p.price_inr))
              const cheapest = items.length > 1 ? items.reduce((a, b) => (Number(b.price_inr) < Number(a.price_inr) ? b : a)) : undefined
              return (
                <article key={c.id} className="card group flex flex-col p-5 transition-all duration-300 hover:border-slate-300 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {editing === c.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            if (draft.trim()) renameComparison(c.id, draft.trim())
                            setEditing(null)
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="input py-1.5" aria-label="Comparison name" />
                          <button type="submit" className="grid h-8 w-8 place-items-center rounded-lg text-navy-800 hover:bg-slate-100" aria-label="Save name"><Check className="h-4 w-4" /></button>
                          <button type="button" onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
                        </form>
                      ) : (
                        <h3 className="truncate font-semibold text-slate-900">{c.title}</h3>
                      )}
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500"><Clock className="h-3 w-3" /> Saved {formatDate(c.createdAt)}</p>
                    </div>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setMenu(menu === c.id ? null : c.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="More actions" aria-expanded={menu === c.id}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menu === c.id && (
                        <div className="animate-fade-in absolute right-0 top-9 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lift">
                          <button onClick={() => { setDraft(c.title); setEditing(c.id); setMenu(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Rename</button>
                          <button onClick={() => { if (confirm(`Delete “${c.title}”?`)) deleteComparison(c.id); setMenu(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="mt-4 space-y-2">
                    {loading && items.length === 0 && c.productSlugs.map((slug) => <Skeleton key={slug} className="h-9 w-full" />)}
                    {items.map((p) => (
                      <li key={p.slug} className="flex items-center gap-3">
                        <ProductThumb category={p.category.slug} imageUrl={p.image_url} size="sm" className="h-9 w-9 rounded-lg" />
                        <Link to={`/app/products/${p.slug}`} className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:text-navy-800">{p.name}</Link>
                        {cheapest?.slug === p.slug && <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-800">Lowest price</span>}
                        <span className="text-sm font-medium text-slate-900">{formatINR(p.price_inr)}</span>
                      </li>
                    ))}
                    {unavailable > 0 && <li className="text-xs text-slate-400">{unavailable} product{unavailable > 1 ? 's' : ''} no longer available</li>}
                  </ul>
                  {c.note && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">“{c.note}”</p>}

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-500">{prices.length ? `${formatINR(Math.min(...prices))} – ${formatINR(Math.max(...prices))}` : ''}</span>
                    <button
                      onClick={() => {
                        setCompare(c.productSlugs)
                        navigate('/app/compare')
                      }}
                      className="btn-secondary py-2 text-xs"
                    >
                      Open comparison
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
