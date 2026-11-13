import { Link } from 'react-router-dom'
import { Bookmark, Cpu, GitCompareArrows, HardDrive, MemoryStick, Plus } from 'lucide-react'
import type { Product, ScoredProduct } from '../types/api'
import { MatchDetails, ScoreBadge } from './MatchDetails'
import { useApp } from '../context/AppContext'
import { cn, formatINR } from '../lib/format'
import { ProductThumb, VerificationBadge } from './ui'

export function productPath(product: Pick<Product, 'slug'>) {
  return `/app/products/${product.slug}`
}

export function ProductCard({ product, compact = false, match }: { product: Product; compact?: boolean; match?: ScoredProduct }) {
  const { compareIds, toggleCompare, savedProductIds, toggleSavedProduct } = useApp()
  const inCompare = compareIds.includes(product.slug)
  const saved = savedProductIds.includes(product.slug)
  const specs = product.specifications
  const keySpecs = [
    { icon: Cpu, value: specs?.processor },
    { icon: MemoryStick, value: specs?.ram && `${specs.ram} RAM` },
    { icon: HardDrive, value: specs?.storage },
  ].filter((s) => s.value)

  return (
    <article className="card group relative flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
      <Link to={productPath(product)} className={cn('block p-3', compact ? 'h-32' : 'h-40')} tabIndex={-1} aria-hidden="true">
        <ProductThumb category={product.category.slug} imageUrl={product.image_url} alt={product.name} />
      </Link>
      <button
        onClick={() => toggleSavedProduct(product.slug)}
        aria-label={saved ? `Remove ${product.name} from saved` : `Save ${product.name}`}
        aria-pressed={saved}
        className={cn(
          'absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-lg border bg-white/90 backdrop-blur transition',
          saved ? 'border-navy-200 text-navy-800' : 'border-slate-200 text-slate-400 hover:text-slate-700',
        )}
      >
        <Bookmark className={cn('h-4 w-4', saved && 'fill-navy-800')} />
      </button>
      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-400">
            {product.brand} · {product.model}
          </p>
          <VerificationBadge status={product.verification_status} />
        </div>
        <h3 className="mt-1 font-semibold leading-snug text-slate-900">
          <Link to={productPath(product)} className="rounded transition hover:text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500">
            {product.name}
          </Link>
        </h3>
        {!compact && keySpecs.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {keySpecs.map(({ icon: Icon, value }) => (
              <li key={value} className="flex items-center gap-2 text-xs text-slate-500">
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{value}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-lg font-semibold tracking-tight text-slate-900">{formatINR(product.price_inr)}</p>
          {match && <ScoreBadge match={match} />}
        </div>
        {match && <MatchDetails match={match} />}
        <div className="mt-auto pt-4">
          <button
            onClick={() => toggleCompare(product.slug)}
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
