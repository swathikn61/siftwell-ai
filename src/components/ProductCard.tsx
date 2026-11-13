import { Bookmark, Check, GitCompareArrows, Plus } from 'lucide-react'
import type { Product } from '../data/demo'
import { useApp } from '../context/AppContext'
import { cn, formatPrice } from '../lib/format'
import { ProductThumb, Rating, ScoreBadge } from './ui'

export function ProductCard({ product, reasons, compact = false }: { product: Product; reasons?: string[]; compact?: boolean }) {
  const { compareIds, toggleCompare, savedProductIds, toggleSavedProduct } = useApp()
  const inCompare = compareIds.includes(product.id)
  const saved = savedProductIds.includes(product.id)

  return (
    <article className="card group flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
      <div className={cn('relative p-3', compact ? 'h-32' : 'h-40')}>
        <ProductThumb category={product.category} />
        <button
          onClick={() => toggleSavedProduct(product.id)}
          aria-label={saved ? 'Remove from saved' : 'Save product'}
          aria-pressed={saved}
          className={cn(
            'absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-lg border bg-white/90 backdrop-blur transition',
            saved ? 'border-navy-200 text-navy-800' : 'border-slate-200 text-slate-400 hover:text-slate-700',
          )}
        >
          <Bookmark className={cn('h-4 w-4', saved && 'fill-navy-800')} />
        </button>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{product.brand}</p>
          <ScoreBadge score={product.score} />
        </div>
        <h3 className="mt-1 font-semibold leading-snug text-slate-900">{product.name}</h3>
        {!compact && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{product.tagline}</p>}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight text-slate-900">{formatPrice(product.price)}</span>
          <Rating value={product.rating} reviews={compact ? undefined : product.reviews} />
        </div>
        {reasons && reasons.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
            {reasons.slice(0, 2).map((r) => (
              <li key={r} className="flex items-start gap-2 text-xs text-slate-600">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-600" />
                {r}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-4">
          <button
            onClick={() => toggleCompare(product.id)}
            aria-pressed={inCompare}
            className={cn('w-full', inCompare ? 'btn border border-navy-200 bg-navy-50 text-navy-900 hover:bg-navy-100' : 'btn-secondary')}
          >
            {inCompare ? <GitCompareArrows className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {inCompare ? 'Added to compare' : 'Add to compare'}
          </button>
        </div>
      </div>
    </article>
  )
}
