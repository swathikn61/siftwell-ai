import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Award, Bookmark, Check, GitCompareArrows, Link2, Minus, Plus, Sparkles, Trophy, Wallet, X } from 'lucide-react'
import { MAX_COMPARE, useApp } from '../context/AppContext'
import { DemoBadge, EmptyState, ProductThumb, Rating } from '../components/ui'
import { getCategory, getProduct, products, type Product } from '../data/demo'
import { cn, formatPrice } from '../lib/format'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const { compareIds, setCompare, saveComparison, notify } = useApp()
  const fromUrl = params.get('ids')
  const ids = fromUrl ? fromUrl.split(',').filter(Boolean).slice(0, MAX_COMPARE) : compareIds
  const items = ids.map(getProduct).filter((p): p is Product => !!p)

  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [diffOnly, setDiffOnly] = useState(false)

  const setIds = (next: string[]) => {
    if (fromUrl) setParams(next.length ? { ids: next.join(',') } : {}, { replace: true })
    else setCompare(next)
  }

  const specKeys = useMemo(() => Array.from(new Set(items.flatMap((p) => Object.keys(p.specs)))), [items])
  const visibleKeys = diffOnly ? specKeys.filter((k) => new Set(items.map((p) => p.specs[k] ?? '—')).size > 1) : specKeys

  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare products</h1>
        <p className="mt-1 text-sm text-slate-500">See specs, pros and cons side by side.</p>
        <div className="mt-8">
          <EmptyState
            icon={GitCompareArrows}
            title="Nothing to compare yet"
            text="Add two to four products from search results using “Add to compare”."
            action={<Link to="/app/search" className="btn-primary">Browse products</Link>}
          />
        </div>
      </div>
    )
  }

  const best = {
    price: Math.min(...items.map((p) => p.price)),
    rating: Math.max(...items.map((p) => p.rating)),
    score: Math.max(...items.map((p) => p.score)),
  }
  const overall = items.reduce((a, b) => (b.score > a.score ? b : a))
  const value = items.reduce((a, b) => (b.score / b.price > a.score / a.price ? b : a))
  const budget = items.reduce((a, b) => (b.price < a.price ? b : a))
  const mixedCategories = new Set(items.map((p) => p.category)).size > 1
  const defaultTitle = mixedCategories ? 'My comparison' : `${getCategory(items[0].category).name} comparison`

  const candidates = products.filter((p) => !ids.includes(p.id)).sort((a, b) => Number(b.category === items[0].category) - Number(a.category === items[0].category))

  const submitSave = (e: FormEvent) => {
    e.preventDefault()
    saveComparison(title.trim() || defaultTitle, items.map((p) => p.id))
    setSaving(false)
    setTitle('')
  }

  const copyLink = async () => {
    const url = `${window.location.origin}/app/compare?ids=${items.map((p) => p.id).join(',')}`
    try {
      await navigator.clipboard.writeText(url)
      notify('Link copied to clipboard')
    } catch {
      notify('Could not copy link')
    }
  }

  const cols = `minmax(140px,180px) repeat(${items.length}, minmax(200px, 1fr))`

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare products</h1>
          <p className="mt-1 text-sm text-slate-500">{items.length} of {MAX_COMPARE} products · differences highlighted</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyLink} className="btn-secondary"><Link2 className="h-4 w-4" /> Copy link</button>
          <button onClick={() => setSaving(true)} disabled={items.length < 2} className="btn-primary"><Bookmark className="h-4 w-4" /> Save comparison</button>
        </div>
      </div>

      {/* AI verdict */}
      {items.length >= 2 && (
        <div className="card mt-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-navy-700" />
              <h2 className="text-sm font-semibold text-slate-900">Siftwell verdict</h2>
            </div>
            <DemoBadge label="Simulated AI" />
          </div>
          <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              { icon: Trophy, label: 'Best overall', p: overall, why: `Highest match score (${overall.score}%) for your needs.` },
              { icon: Award, label: 'Best value', p: value, why: `Most match score per dollar at ${formatPrice(value.price)}.` },
              { icon: Wallet, label: 'Budget pick', p: budget, why: `Lowest price — ${formatPrice(items.reduce((s, p) => Math.max(s, p.price), 0) - budget.price)} less than the priciest option.` },
            ].map(({ icon: Icon, label, p, why }) => (
              <div key={label} className="p-5">
                <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5 text-navy-700" /> {label}</p>
                <p className="mt-2 font-semibold text-slate-900">{p.name}</p>
                <p className="mt-1 text-sm text-slate-500">{why}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 1 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Add at least one more product to see a full comparison and verdict.</div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
          <button
            role="switch"
            aria-checked={diffOnly}
            onClick={() => setDiffOnly((d) => !d)}
            className={cn('relative h-5 w-9 rounded-full transition-colors', diffOnly ? 'bg-navy-900' : 'bg-slate-300')}
          >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', diffOnly ? 'left-[18px]' : 'left-0.5')} />
          </button>
          Show differences only
        </label>
      </div>

      {/* Comparison table */}
      <div className="card mt-3 overflow-x-auto">
        <div className="min-w-fit">
          {/* Header row */}
          <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: cols }}>
            <div className="flex items-end p-4">
              {items.length < MAX_COMPARE && (
                <button onClick={() => setAdding(true)} className="btn-secondary w-full py-2 text-xs"><Plus className="h-3.5 w-3.5" /> Add product</button>
              )}
            </div>
            {items.map((p) => (
              <div key={p.id} className="relative border-l border-slate-100 p-4">
                <button onClick={() => setIds(ids.filter((x) => x !== p.id))} className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-lg bg-white/80 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${p.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="h-28"><ProductThumb category={p.category} /></div>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">{p.brand}</p>
                <p className="font-semibold leading-snug text-slate-900">{p.name}</p>
                {p.id === overall.id && items.length > 1 && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-navy-900 px-2 py-0.5 text-[11px] font-medium text-white"><Trophy className="h-3 w-3" /> Top pick</span>
                )}
              </div>
            ))}
          </div>

          <Row label="Price" cols={cols}>
            {items.map((p) => <Cell key={p.id} best={items.length > 1 && p.price === best.price}><span className="text-base font-semibold">{formatPrice(p.price)}</span></Cell>)}
          </Row>
          <Row label="Match score" cols={cols}>
            {items.map((p) => (
              <Cell key={p.id} best={items.length > 1 && p.score === best.score}>
                <div className="w-full max-w-[160px]">
                  <span className="font-medium">{p.score}%</span>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-navy-800" style={{ width: `${p.score}%` }} /></div>
                </div>
              </Cell>
            ))}
          </Row>
          <Row label="Rating" cols={cols}>
            {items.map((p) => <Cell key={p.id} best={items.length > 1 && p.rating === best.rating}><Rating value={p.rating} reviews={p.reviews} /></Cell>)}
          </Row>
          {visibleKeys.map((k) => (
            <Row key={k} label={k} cols={cols}>
              {items.map((p) => <Cell key={p.id}>{p.specs[k] ?? <Minus className="h-4 w-4 text-slate-300" />}</Cell>)}
            </Row>
          ))}
          {diffOnly && visibleKeys.length === 0 && (
            <p className="border-b border-slate-100 px-4 py-4 text-sm text-slate-500">These products share identical specs.</p>
          )}
          <Row label="Pros" cols={cols}>
            {items.map((p) => (
              <Cell key={p.id}>
                <ul className="space-y-1.5">{p.pros.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{x}</li>)}</ul>
              </Cell>
            ))}
          </Row>
          <Row label="Cons" cols={cols} last>
            {items.map((p) => (
              <Cell key={p.id}>
                <ul className="space-y-1.5">{p.cons.map((x) => <li key={x} className="flex gap-2"><Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />{x}</li>)}</ul>
              </Cell>
            ))}
          </Row>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">All products, prices and ratings are fictional demo data for UI preview.</p>

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
          <div className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto">
            {candidates.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setIds([...ids, p.id])
                  setAdding(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50"
              >
                <ProductThumb category={p.category} size="sm" className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">{getCategory(p.category).name} · {formatPrice(p.price)}</p>
                </div>
                <Plus className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Row({ label, cols, children, last }: { label: string; cols: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn('grid transition-colors hover:bg-slate-50/50', !last && 'border-b border-slate-100')} style={{ gridTemplateColumns: cols }}>
      <div className="sticky left-0 z-[1] bg-white/95 px-4 py-3.5 text-sm font-medium text-slate-500 backdrop-blur">{label}</div>
      {children}
    </div>
  )
}

function Cell({ children, best }: { children: React.ReactNode; best?: boolean }) {
  return (
    <div className={cn('flex items-start gap-2 border-l border-slate-100 px-4 py-3.5 text-sm text-slate-800', best && 'bg-navy-50/50')}>
      <div className="flex-1">{children}</div>
      {best && <span className="shrink-0 rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Best</span>}
    </div>
  )
}
