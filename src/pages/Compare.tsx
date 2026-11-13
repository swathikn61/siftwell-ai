import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Battery, Bookmark, Check, Cpu, GitCompareArrows, HardDrive, Info, Link2, MemoryStick, Minus, Monitor, Plus, Scale,
  Search, ThumbsDown, ThumbsUp, Trash2, Trophy, Wallet, X, Zap, type LucideIcon,
} from 'lucide-react'
import { MAX_COMPARE, useApp } from '../context/AppContext'
import { useComparison, useProducts } from '../hooks/useApi'
import { errorMessage } from '../lib/api'
import { cn, formatINR } from '../lib/format'
import { productPath } from '../components/ProductCard'
import { EmptyState, ErrorState, ProductThumb, Skeleton, VerificationBadge } from '../components/ui'
import { DecisionAssistant } from '../components/DecisionAssistant'
import type { AssistantContext, Comparison, Product, ProductAnalysis, SpecComparison, SpecKey } from '../types/api'

const specIcons: Record<SpecKey, LucideIcon> = {
  price: Wallet,
  processor: Cpu,
  ram: MemoryStick,
  storage: HardDrive,
  battery: Battery,
  display: Monitor,
  graphics: Zap,
}

/** Specs whose listed text is identical for every product (hidden by "differences only"). */
function allSame(spec: SpecComparison) {
  return new Set(spec.values.map((v) => v.display ?? '')).size <= 1
}

// ---------------------------------------------------------------------------
// Small building blocks
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

function ProductPicker({ exclude, category, onPick }: { exclude: string[]; category?: string; onPick: (slug: string) => void }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(text.trim()), 250)
    return () => window.clearTimeout(t)
  }, [text])
  const { data, loading, error, reload } = useProducts({ q: query || undefined, category: query ? undefined : category, limit: 12 })
  const items = data?.items.filter((p) => !exclude.includes(p.slug)) ?? []

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, brand or spec" className="input pl-9" aria-label="Search products to add" />
      </div>
      {!query && category && <p className="mt-2 text-xs text-slate-400">Showing products in the same category. Type to search everything.</p>}
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

function BestBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      <Check className="h-2.5 w-2.5" strokeWidth={3} /> Best
    </span>
  )
}

function SpecNote({ spec }: { spec: SpecComparison }) {
  if (spec.best.length && spec.reason) return <p className="mt-1 text-xs leading-snug text-navy-700">{spec.reason}</p>
  if (spec.not_compared) return <p className="mt-1 text-xs leading-snug text-slate-400">{spec.not_compared}</p>
  return null
}

function ProsCons({ analysis, kind }: { analysis?: ProductAnalysis; kind: 'pro' | 'con' }) {
  const items = (kind === 'pro' ? analysis?.advantages : analysis?.disadvantages) ?? []
  if (!items.length) {
    return <p className="text-sm text-slate-400">{kind === 'pro' ? 'No clear advantages here' : 'No clear disadvantages here'}</p>
  }
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-sm leading-snug text-slate-700">
          {kind === 'pro' ? <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} /> : <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" strokeWidth={2.5} />}
          {t}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Product selection slots
// ---------------------------------------------------------------------------
function SelectionSlots({ products, analysis, leader, loading, pendingCount, onRemove, onAdd }: {
  products: Product[]
  analysis: Map<string, ProductAnalysis>
  leader: string | null
  loading: boolean
  pendingCount: number
  onRemove: (slug: string) => void
  onAdd: () => void
}) {
  const empty = Math.max(0, MAX_COMPARE - products.length - pendingCount)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {products.map((p) => {
        const led = analysis.get(p.slug)?.specs_led.length ?? 0
        return (
          <div key={p.slug} className={cn('card group relative flex flex-col p-3 transition-shadow hover:shadow-lift', p.slug === leader && 'ring-2 ring-navy-900/80')}>
            <button onClick={() => onRemove(p.slug)} className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-slate-400 shadow-soft ring-1 ring-slate-200 transition hover:text-rose-600" aria-label={`Remove ${p.name} from comparison`} title="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
            <Link to={productPath(p)} className="block h-24 sm:h-28" tabIndex={-1} aria-hidden="true">
              <ProductThumb category={p.category.slug} imageUrl={p.image_url} alt={p.name} />
            </Link>
            <p className="mt-3 truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">{p.brand} · {p.model}</p>
            <Link to={productPath(p)} className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 hover:text-navy-800 sm:text-base">{p.name}</Link>
            <p className="mt-1 font-semibold text-slate-900">{formatINR(p.price_inr)}</p>
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
              <VerificationBadge status={p.verification_status} />
              {products.length > 1 && !loading && (
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', p.slug === leader ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600')}>
                  {p.slug === leader && <Trophy className="mr-1 inline h-3 w-3 -translate-y-px" />}
                  Leads {led} {led === 1 ? 'spec' : 'specs'}
                </span>
              )}
            </div>
          </div>
        )
      })}
      {Array.from({ length: pendingCount }).map((_, i) => <Skeleton key={`p${i}`} className="h-56 rounded-2xl" />)}
      {Array.from({ length: empty }).map((_, i) => (
        <button
          key={`e${i}`}
          onClick={onAdd}
          className="group flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-4 text-sm text-slate-500 transition hover:border-navy-300 hover:bg-navy-50/40 hover:text-navy-800"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 transition group-hover:bg-navy-900 group-hover:text-white">
            <Plus className="h-5 w-5" />
          </span>
          Add product
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function SummaryCard({ data }: { data: Comparison }) {
  const { summary } = data
  const name = (slug: string | null) => data.products.find((p) => p.slug === slug)?.name
  return (
    <section className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1fr_300px]">
        <div className="p-5 sm:p-6">
          <p className="eyebrow">Overall summary</p>
          <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-900 sm:text-xl">{summary.headline}</h2>
          {summary.points.length > 0 && (
            <ul className="mt-4 space-y-2">
              {summary.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm text-slate-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y lg:border-l lg:border-t-0">
          <Stat icon={Trophy} label="Leads most specs" value={name(summary.most_specs_led) ?? 'No single leader'} muted={!summary.most_specs_led} />
          <Stat icon={Wallet} label="Lowest price" value={name(summary.lowest_price) ?? 'Tie'} muted={!summary.lowest_price} />
          <Stat icon={Scale} label="Specs with a clear winner" value={`${summary.compared_specs} of ${data.specs.filter((s) => s.values.some((v) => v.display)).length}`} />
        </div>
      </div>
      {summary.notes.length > 0 && (
        <details className="group border-t border-slate-100 px-5 py-3 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <Info className="h-4 w-4 text-slate-400" />
            How this was compared · {summary.notes.length} {summary.notes.length === 1 ? 'note' : 'notes'}
            <span className="ml-auto text-xs text-slate-400 group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs text-slate-400 group-open:inline">Hide</span>
          </summary>
          <ul className="mt-3 space-y-1.5 pb-1">
            {summary.notes.map((n) => <li key={n} className="text-sm text-slate-500">• {n}</li>)}
            <li className="pt-1 text-xs text-slate-400">{data.method}</li>
          </ul>
        </details>
      )}
    </section>
  )
}

function Stat({ icon: Icon, label, value, muted }: { icon: LucideIcon; label: string; value: string; muted?: boolean }) {
  return (
    <div className="px-4 py-3.5 lg:px-5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5" /> <span className="truncate">{label}</span></p>
      <p className={cn('mt-1 truncate text-sm font-semibold', muted ? 'text-slate-400' : 'text-slate-900')} title={value}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Side-by-side table (tablet and desktop)
// ---------------------------------------------------------------------------
function ComparisonTable({ data, specs, analysis }: { data: Comparison; specs: SpecComparison[]; analysis: Map<string, ProductAnalysis> }) {
  const cols = `minmax(170px, 220px) repeat(${data.products.length}, minmax(180px, 1fr))`
  const valueOf = (spec: SpecComparison, slug: string) => spec.values.find((v) => v.slug === slug)?.display ?? null
  return (
    <div className="card hidden overflow-x-auto md:block">
      <div className="min-w-fit" role="table" aria-label="Side-by-side comparison">
        <div className="sticky top-0 z-[2] grid border-b border-slate-200 bg-white/95 backdrop-blur" style={{ gridTemplateColumns: cols }} role="row">
          <div className="sticky left-0 bg-white/95 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400" role="columnheader">Specification</div>
          {data.products.map((p) => (
            <div key={p.slug} className="flex items-center gap-2.5 border-l border-slate-100 px-4 py-3" role="columnheader">
              <ProductThumb category={p.category.slug} imageUrl={p.image_url} size="sm" className="h-9 w-9 rounded-lg" />
              <Link to={productPath(p)} className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 hover:text-navy-800">{p.name}</Link>
            </div>
          ))}
        </div>

        {specs.map((spec) => {
          const Icon = specIcons[spec.key]
          return (
            <div key={spec.key} className="grid border-b border-slate-100 transition-colors hover:bg-slate-50/40" style={{ gridTemplateColumns: cols }} role="row">
              <div className="sticky left-0 z-[1] bg-white/95 px-5 py-4 backdrop-blur" role="rowheader">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><Icon className="h-4 w-4 text-slate-400" /> {spec.label}</p>
                <SpecNote spec={spec} />
              </div>
              {data.products.map((p) => {
                const value = valueOf(spec, p.slug)
                const best = spec.best.includes(p.slug)
                return (
                  <div key={p.slug} className={cn('flex items-start gap-2 border-l border-slate-100 px-4 py-4 text-sm', best ? 'bg-navy-50/60' : '')} role="cell">
                    <span className={cn('flex-1', spec.key === 'price' && 'text-base font-semibold', value ? 'text-slate-900' : 'text-slate-400', best && 'font-semibold text-navy-950')}>
                      {value ?? 'Not listed'}
                    </span>
                    {best && <BestBadge />}
                  </div>
                )
              })}
            </div>
          )
        })}

        {(['pro', 'con'] as const).map((kind) => (
          <div key={kind} className={cn('grid', kind === 'pro' && 'border-b border-slate-100')} style={{ gridTemplateColumns: cols }} role="row">
            <div className="sticky left-0 z-[1] bg-white/95 px-5 py-4 backdrop-blur" role="rowheader">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                {kind === 'pro' ? <ThumbsUp className="h-4 w-4 text-emerald-600" /> : <ThumbsDown className="h-4 w-4 text-rose-500" />}
                {kind === 'pro' ? 'Advantages' : 'Disadvantages'}
              </p>
              <p className="mt-1 text-xs text-slate-400">Compared with the other products here</p>
            </div>
            {data.products.map((p) => (
              <div key={p.slug} className="border-l border-slate-100 px-4 py-4" role="cell">
                <ProsCons analysis={analysis.get(p.slug)} kind={kind} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stacked view (phones)
// ---------------------------------------------------------------------------
function ComparisonStack({ data, specs, analysis }: { data: Comparison; specs: SpecComparison[]; analysis: Map<string, ProductAnalysis> }) {
  const product = (slug: string) => data.products.find((p) => p.slug === slug)!
  return (
    <div className="space-y-3 md:hidden">
      {specs.map((spec) => {
        const Icon = specIcons[spec.key]
        return (
          <section key={spec.key} className="card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon className="h-4 w-4 text-slate-400" /> {spec.label}</h3>
            <SpecNote spec={spec} />
            <ul className="mt-3 divide-y divide-slate-100">
              {spec.values.map((v) => {
                const best = spec.best.includes(v.slug)
                return (
                  <li key={v.slug} className={cn('-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5', best && 'bg-navy-50/60')}>
                    <span className="w-28 shrink-0 truncate text-xs font-medium text-slate-500">{product(v.slug).name}</span>
                    <span className={cn('flex-1 text-sm', v.display ? 'text-slate-900' : 'text-slate-400', best && 'font-semibold')}>{v.display ?? 'Not listed'}</span>
                    {best && <BestBadge />}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <h3 className="px-1 pt-3 text-sm font-semibold text-slate-900">Advantages & disadvantages</h3>
      {data.products.map((p) => (
        <section key={p.slug} className="card p-4">
          <p className="font-semibold text-slate-900">{p.name}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><ThumbsUp className="h-3.5 w-3.5" /> Advantages</p>
              <ProsCons analysis={analysis.get(p.slug)} kind="pro" />
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-600"><ThumbsDown className="h-3.5 w-3.5" /> Disadvantages</p>
              <ProsCons analysis={analysis.get(p.slug)} kind="con" />
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { compareIds: slugs, setCompare, saveComparison, notify } = useApp()
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [diffOnly, setDiffOnly] = useState(false)

  // A shared or saved link (?ids=a,b,c) loads those products into the comparison
  const idsParam = params.get('ids')
  useEffect(() => {
    if (idsParam !== null) {
      setCompare(idsParam.split(',').filter(Boolean))
      setParams({}, { replace: true })
    }
  }, [idsParam, setCompare, setParams])

  const { data, error, loading, reload } = useComparison(slugs)
  // Only show products that are still selected (instant feedback while a new comparison loads)
  const shown = data?.products.filter((p) => slugs.includes(p.slug)) ?? []
  const pendingCount = loading ? slugs.filter((s) => !shown.some((p) => p.slug === s) && !data?.missing.includes(s)).length : 0
  const analysis = new Map(data?.analysis.map((a) => [a.slug, a]) ?? [])
  const complete = !!data && !loading && shown.length === data.products.length

  const remove = (slug: string) => setCompare(slugs.filter((s) => s !== slug))
  const add = (slug: string) => {
    setCompare([...slugs, slug])
    setPicking(false)
  }

  const visibleSpecs = (data?.specs ?? []).filter((s) => {
    if (s.values.every((v) => v.display === null)) return false // e.g. graphics for phones
    return !diffOnly || !allSame(s)
  })
  const firstCategory = shown[0]?.category.slug
  const sameCategory = shown.every((p) => p.category.slug === firstCategory)

  // Decision Assistant for this comparison (scores use the engine's default weights)
  const shownKey = shown.map((p) => p.slug).join(',')
  const assistantContext: AssistantContext | null = shown.length
    ? {
        product_slugs: shown.map((p) => p.slug),
        preferences: {
          category: sameCategory ? (firstCategory as 'laptops' | 'smartphones') : null,
          min_budget_inr: null, max_budget_inr: null, use_cases: [], priorities: [], hardware_preferences: [], brands: [],
        },
        weights: null,
        adjust_for_usage: true,
      }
    : null
  const defaultTitle = !sameCategory || !shown.length ? 'My comparison' : `${shown[0].category.name} comparison`

  const submitSave = (e: FormEvent) => {
    e.preventDefault()
    saveComparison(title.trim() || defaultTitle, shown.map((p) => p.slug))
    setSaving(false)
    setTitle('')
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/compare?ids=${slugs.join(',')}`)
      notify('Link copied to clipboard')
    } catch {
      notify('Could not copy the link')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare products</h1>
          <p className="mt-1 text-sm text-slate-500">Choose up to {MAX_COMPARE} products to see their specs side by side.</p>
        </div>
        {slugs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={copyLink} className="btn-secondary"><Link2 className="h-4 w-4" /> <span className="hidden sm:inline">Copy link</span></button>
            <button onClick={() => setCompare([])} className="btn-secondary"><Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Clear all</span></button>
            <button onClick={() => setSaving(true)} disabled={shown.length < 2} className="btn-primary"><Bookmark className="h-4 w-4" /> Save</button>
          </div>
        )}
      </div>

      {/* Nothing selected */}
      {slugs.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Pick products to compare"
          text="Add two to four products. You can add them here, or use “Add to compare” on any product in search."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => setPicking(true)} className="btn-primary"><Plus className="h-4 w-4" /> Add product</button>
              <button onClick={() => navigate('/app/search')} className="btn-secondary">Browse products</button>
            </div>
          }
        />
      ) : error ? (
        <ErrorState title="Couldn’t compare these products" message={errorMessage(error)} onRetry={reload} />
      ) : (
        <>
          <SelectionSlots
            products={shown}
            analysis={analysis}
            leader={complete ? data!.summary.most_specs_led : null}
            loading={!complete}
            pendingCount={pendingCount}
            onRemove={remove}
            onAdd={() => setPicking(true)}
          />

          {data && data.missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Info className="h-4 w-4 shrink-0" />
              <span className="flex-1">{data.missing.length} selected product{data.missing.length > 1 ? 's are' : ' is'} no longer in the catalogue.</span>
              <button onClick={() => setCompare(slugs.filter((s) => !data.missing.includes(s)))} className="font-medium underline-offset-2 hover:underline">Remove</button>
            </div>
          )}

          {!data ? (
            <div className="space-y-4">
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-96 rounded-2xl" />
            </div>
          ) : shown.length < 2 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-soft">
              <Info className="h-4 w-4 shrink-0 text-navy-600" />
              Add at least one more product to see the side-by-side comparison.
            </div>
          ) : (
            <div className={cn('space-y-6 transition-opacity', !complete && 'pointer-events-none opacity-50')}>
              <SummaryCard data={data} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">Side-by-side comparison</h2>
                <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
                  <button role="switch" aria-checked={diffOnly} onClick={() => setDiffOnly((d) => !d)} className={cn('relative h-5 w-9 rounded-full transition-colors', diffOnly ? 'bg-navy-900' : 'bg-slate-300')}>
                    <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', diffOnly ? 'left-[18px]' : 'left-0.5')} />
                  </button>
                  Differences only
                </label>
              </div>

              <ComparisonTable data={data} specs={visibleSpecs} analysis={analysis} />
              <ComparisonStack data={data} specs={visibleSpecs} analysis={analysis} />

              <p className="flex items-start gap-2 text-xs text-slate-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                “Best” is shown only when every product lists that spec in a comparable form and the values differ. {data.method}
                {data.products.some((p) => p.is_demo) && ' Products marked “Demo data” are fictional samples.'}
              </p>
            </div>
          )}
        </>
      )}

      {complete && (
        <DecisionAssistant
          context={assistantContext}
          storageKey={`siftwell:chat:compare:v1:${shownKey}`}
          title="Ask about this comparison"
          suggestions={[
            'Which is the best overall?',
            'Which one has the best battery?',
            'Is the most expensive one worth buying?',
            'Which is better for programming?',
            'What are the disadvantages of each?',
          ]}
        />
      )}

      {picking && (
        <Modal title="Add a product" onClose={() => setPicking(false)}>
          <ProductPicker exclude={slugs} category={firstCategory} onPick={add} />
        </Modal>
      )}
      {saving && (
        <Modal title="Save comparison" onClose={() => setSaving(false)}>
          <form onSubmit={submitSave}>
            <label htmlFor="cmp-title" className="label">Name</label>
            <input id="cmp-title" autoFocus className="input" placeholder={defaultTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
            <p className="mt-2 text-xs text-slate-500">{shown.map((p) => p.name).join(' · ')}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setSaving(false)} className="btn-ghost">Cancel</button>
              <button type="submit" className="btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
