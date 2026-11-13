import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Battery, Bookmark, GitCompareArrows, HardDrive, Info, Link2, MemoryStick, Minus, Plus, Search, Wallet, X } from 'lucide-react'
import { MAX_COMPARE, useApp } from '../context/AppContext'
import { useProducts, useProductsBySlugs } from '../hooks/useApi'
import { errorMessage } from '../lib/api'
import { cn, formatINR } from '../lib/format'
import { productPath } from '../components/ProductCard'
import { EmptyState, ErrorState, ProductThumb, Skeleton, VerificationBadge } from '../components/ui'
import type { Product, Specifications } from '../types/api'

// ---------------------------------------------------------------------------
// Parse comparable numbers out of spec text ("16 GB LPDDR5" → 16, "1 TB SSD" → 1024)
// ---------------------------------------------------------------------------
function sizeInGB(text: string | null | undefined): number | undefined {
  const m = text?.match(/(\d+(?:\.\d+)?)\s*(TB|GB)/i)
  if (!m) return undefined
  return parseFloat(m[1]) * (m[2].toUpperCase() === 'TB' ? 1024 : 1)
}

function battery(text: string | null | undefined): { value: number; unit: string } | undefined {
  const m = text?.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(mAh|Wh)/i)
  return m ? { value: parseFloat(m[1]), unit: m[2].toLowerCase() } : undefined
}

type Metric = { key: string; label: string; icon: typeof Wallet; values: (number | undefined)[]; best: 'min' | 'max'; format: (p: Product) => string }

function bestIndexes(values: (number | undefined)[], best: 'min' | 'max'): Set<number> {
  const nums = values.filter((v): v is number => v !== undefined)
  if (nums.length < 2 || new Set(nums).size < 2) return new Set() // nothing to compare, or all equal
  const target = best === 'min' ? Math.min(...nums) : Math.max(...nums)
  return new Set(values.flatMap((v, i) => (v === target ? [i] : [])))
}

// ---------------------------------------------------------------------------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade-in absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="card animate-fade-up relative w-full max-w-md p-6 shadow-lift">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function AddProductPicker({ exclude, category, onPick }: { exclude: string[]; category?: string; onPick: (slug: string) => void }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(text.trim()), 250)
    return () => window.clearTimeout(t)
  }, [text])
  const { data, loading, error, reload } = useProducts({ q: query || undefined, category: query ? undefined : category, limit: 10 })
  const items = data?.items.filter((p) => !exclude.includes(p.slug)) ?? []

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, brand or spec" className="input pl-9" aria-label="Search products to add" />
      </div>
      <div className="-mx-2 mt-3 max-h-80 space-y-0.5 overflow-y-auto">
        {error ? (
          <div className="px-2"><ErrorState compact message={errorMessage(error)} onRetry={reload} /></div>
        ) : loading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mx-2 my-2 h-10" />)
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-slate-500">No products found.</p>
        ) : (
          items.map((p) => (
            <button key={p.slug} onClick={() => onPick(p.slug)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50">
              <ProductThumb category={p.category.slug} imageUrl={p.image_url} size="sm" className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">{p.brand} · {p.category.name} · {formatINR(p.price_inr)}</p>
              </div>
              <Plus className="h-4 w-4 text-slate-400" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const { compareIds, setCompare, saveComparison, notify } = useApp()
  const fromUrl = params.get('ids')
  const slugs = fromUrl ? fromUrl.split(',').filter(Boolean).slice(0, MAX_COMPARE) : compareIds
  const { products: items, missing, loading, error, reload } = useProductsBySlugs(slugs)

  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [diffOnly, setDiffOnly] = useState(false)

  const setSlugs = (next: string[]) => {
    if (fromUrl) setParams(next.length ? { ids: next.join(',') } : {}, { replace: true })
    else setCompare(next)
  }

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare products</h1>
      <p className="mt-1 text-sm text-slate-500">See prices and specifications side by side.</p>
    </div>
  )

  if (slugs.length === 0) {
    return (
      <div>
        {header}
        <div className="mt-8">
          <EmptyState icon={GitCompareArrows} title="Nothing to compare yet" text="Add two to four products from search results using “Add to compare”." action={<Link to="/app/search" className="btn-primary">Browse products</Link>} />
        </div>
      </div>
    )
  }
  if (error) {
    return <div>{header}<div className="mt-8"><ErrorState title="Couldn’t load these products" message={errorMessage(error)} onRetry={reload} /></div></div>
  }
  if (loading) {
    return (
      <div>
        {header}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {slugs.map((s) => <Skeleton key={s} className="h-72 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const removeMissing = () => setSlugs(slugs.filter((s) => !missing.includes(s)))
  if (items.length === 0) {
    return (
      <div>
        {header}
        <div className="mt-8">
          <EmptyState icon={GitCompareArrows} title="These products are no longer available" text="They may have been removed from the catalogue." action={<button onClick={() => setSlugs([])} className="btn-primary">Start a new comparison</button>} />
        </div>
      </div>
    )
  }

  // Highlights computed from the listed specs (not AI)
  const batteries = items.map((p) => battery(p.specifications?.battery))
  const batteryUnits = new Set(batteries.filter(Boolean).map((b) => b!.unit))
  const metrics: Metric[] = [
    { key: 'price', label: 'Lowest price', icon: Wallet, values: items.map((p) => Number(p.price_inr)), best: 'min', format: (p) => formatINR(p.price_inr) },
    { key: 'ram', label: 'Most RAM', icon: MemoryStick, values: items.map((p) => sizeInGB(p.specifications?.ram)), best: 'max', format: (p) => p.specifications?.ram ?? '' },
    { key: 'storage', label: 'Most storage', icon: HardDrive, values: items.map((p) => sizeInGB(p.specifications?.storage)), best: 'max', format: (p) => p.specifications?.storage ?? '' },
    // Only compare batteries measured in the same unit (mAh for phones, Wh for laptops)
    { key: 'battery', label: 'Largest battery', icon: Battery, values: batteryUnits.size === 1 ? batteries.map((b) => b?.value) : [], best: 'max', format: (p) => p.specifications?.battery ?? '' },
  ]
  const best = Object.fromEntries(metrics.map((m) => [m.key, bestIndexes(m.values, m.best)]))
  const highlights = metrics.filter((m) => best[m.key].size > 0)

  const specKeys: { key: keyof Specifications; label: string; metric?: string }[] = [
    { key: 'processor', label: 'Processor' },
    { key: 'ram', label: 'RAM', metric: 'ram' },
    { key: 'storage', label: 'Storage', metric: 'storage' },
    { key: 'battery', label: 'Battery', metric: 'battery' },
    { key: 'display', label: 'Display' },
    { key: 'graphics', label: 'Graphics' },
  ]
  const visibleSpecs = specKeys.filter((s) => {
    const values = items.map((p) => p.specifications?.[s.key] ?? null)
    if (values.every((v) => v === null)) return false // e.g. graphics for phones
    return !diffOnly || new Set(values).size > 1
  })

  const categories = new Set(items.map((p) => p.category.slug))
  const defaultTitle = categories.size > 1 ? 'My comparison' : `${items[0].category.name} comparison`

  const submitSave = (e: FormEvent) => {
    e.preventDefault()
    saveComparison(title.trim() || defaultTitle, items.map((p) => p.slug))
    setSaving(false)
    setTitle('')
  }

  const copyLink = async () => {
    const url = `${window.location.origin}/app/compare?ids=${items.map((p) => p.slug).join(',')}`
    try {
      await navigator.clipboard.writeText(url)
      notify('Link copied to clipboard')
    } catch {
      notify('Could not copy the link')
    }
  }

  const cols = `minmax(130px,170px) repeat(${items.length}, minmax(200px, 1fr))`

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare products</h1>
          <p className="mt-1 text-sm text-slate-500">{items.length} of {MAX_COMPARE} products · best values highlighted</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyLink} className="btn-secondary"><Link2 className="h-4 w-4" /> Copy link</button>
          <button onClick={() => setSaving(true)} disabled={items.length < 2} className="btn-primary"><Bookmark className="h-4 w-4" /> Save comparison</button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="h-4 w-4 shrink-0" />
          <span className="flex-1">{missing.length} product{missing.length > 1 ? 's are' : ' is'} no longer in the catalogue and {missing.length > 1 ? 'were' : 'was'} left out.</span>
          <button onClick={removeMissing} className="font-medium underline-offset-2 hover:underline">Remove from list</button>
        </div>
      )}
      {categories.size > 1 && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Info className="h-4 w-4 shrink-0 text-slate-400" /> You’re comparing products from different categories, so some specs won’t line up.
        </div>
      )}
      {items.length === 1 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Add at least one more product to compare.</div>
      )}

      {highlights.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Highlights</h2>
            <span className="text-xs text-slate-400">Calculated from the listed specs</span>
          </div>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {highlights.map((m) => {
              const winners = [...best[m.key]].map((i) => items[i])
              return (
                <div key={m.key} className="p-5">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><m.icon className="h-3.5 w-3.5 text-navy-700" /> {m.label}</p>
                  <p className="mt-2 font-semibold text-slate-900">{winners.map((p) => p.name).join(', ')}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{m.format(winners[0])}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center">
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
          <button role="switch" aria-checked={diffOnly} onClick={() => setDiffOnly((d) => !d)} className={cn('relative h-5 w-9 rounded-full transition-colors', diffOnly ? 'bg-navy-900' : 'bg-slate-300')}>
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', diffOnly ? 'left-[18px]' : 'left-0.5')} />
          </button>
          Show differences only
        </label>
      </div>

      <div className="card mt-3 overflow-x-auto">
        <div className="min-w-fit">
          <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: cols }}>
            <div className="flex items-end p-4">
              {items.length < MAX_COMPARE && (
                <button onClick={() => setAdding(true)} className="btn-secondary w-full py-2 text-xs"><Plus className="h-3.5 w-3.5" /> Add product</button>
              )}
            </div>
            {items.map((p) => (
              <div key={p.slug} className="relative border-l border-slate-100 p-4">
                <button onClick={() => setSlugs(slugs.filter((x) => x !== p.slug))} className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-lg bg-white/80 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${p.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
                <Link to={productPath(p)} className="block h-28"><ProductThumb category={p.category.slug} imageUrl={p.image_url} alt={p.name} /></Link>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">{p.brand} · {p.model}</p>
                <Link to={productPath(p)} className="font-semibold leading-snug text-slate-900 hover:text-navy-800">{p.name}</Link>
                <div className="mt-2"><VerificationBadge status={p.verification_status} /></div>
              </div>
            ))}
          </div>

          <Row label="Price" cols={cols}>
            {items.map((p, i) => <Cell key={p.slug} best={best.price.has(i)}><span className="text-base font-semibold">{formatINR(p.price_inr)}</span></Cell>)}
          </Row>
          {!diffOnly && (
            <Row label="Category" cols={cols}>
              {items.map((p) => <Cell key={p.slug}>{p.category.name}</Cell>)}
            </Row>
          )}
          {visibleSpecs.map((s) => (
            <Row key={s.key} label={s.label} cols={cols}>
              {items.map((p, i) => (
                <Cell key={p.slug} best={s.metric ? best[s.metric].has(i) : false}>
                  {p.specifications?.[s.key] ?? <Minus className="h-4 w-4 text-slate-300" aria-label="Not listed" />}
                </Cell>
              ))}
            </Row>
          ))}
          {diffOnly && visibleSpecs.length === 0 && <p className="border-b border-slate-100 px-4 py-4 text-sm text-slate-500">These products have identical listed specs.</p>}
          <Row label="Last verified" cols={cols} last>
            {items.map((p) => <Cell key={p.slug}><span className="text-slate-500">{p.last_verified_date ?? (p.is_demo ? 'Demo data' : 'Not verified')}</span></Cell>)}
          </Row>
        </div>
      </div>
      {items.some((p) => p.is_demo) && (
        <p className="mt-3 text-xs text-slate-400">Products marked “Demo data” are fictional samples — their specs and prices are not real-world information.</p>
      )}

      {saving && (
        <Modal title="Save comparison" onClose={() => setSaving(false)}>
          <form onSubmit={submitSave}>
            <label htmlFor="cmp-title" className="label">Name</label>
            <input id="cmp-title" autoFocus className="input" placeholder={defaultTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
            <p className="mt-2 text-xs text-slate-500">{items.map((p) => p.name).join(' · ')}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setSaving(false)} className="btn-ghost">Cancel</button>
              <button type="submit" className="btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
      {adding && (
        <Modal title="Add a product" onClose={() => setAdding(false)}>
          <AddProductPicker
            exclude={slugs}
            category={categories.size === 1 ? items[0].category.slug : undefined}
            onPick={(slug) => {
              setSlugs([...slugs, slug])
              setAdding(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function Row({ label, cols, children, last }: { label: string; cols: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={cn('grid transition-colors hover:bg-slate-50/50', !last && 'border-b border-slate-100')} style={{ gridTemplateColumns: cols }}>
      <div className="sticky left-0 z-[1] bg-white/95 px-4 py-3.5 text-sm font-medium text-slate-500 backdrop-blur">{label}</div>
      {children}
    </div>
  )
}

function Cell({ children, best }: { children: ReactNode; best?: boolean }) {
  return (
    <div className={cn('flex items-start gap-2 border-l border-slate-100 px-4 py-3.5 text-sm text-slate-800', best && 'bg-navy-50/50')}>
      <div className="flex-1">{children}</div>
      {best && <span className="shrink-0 rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Best</span>}
    </div>
  )
}
