import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Battery, Bookmark, ChevronRight, Cpu, ExternalLink, FlaskConical, GitCompareArrows, HardDrive, MemoryStick,
  Monitor, PackageX, Plus, Zap,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useProduct, useProducts } from '../hooks/useApi'
import { ApiError, errorMessage } from '../lib/api'
import { cn, formatINR } from '../lib/format'
import { ProductCard } from '../components/ProductCard'
import { EmptyState, ErrorState, ProductCardSkeleton, ProductThumb, SectionHeader, Skeleton, VerificationBadge } from '../components/ui'
import type { Product } from '../types/api'

/** "2026-11-01" → "1 Nov 2026" without timezone shifts */
function formatPlainDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
}

function hostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function DetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-2" aria-label="Loading product">
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  )
}

function SimilarProducts({ product }: { product: Product }) {
  const price = Number(product.price_inr)
  const { data, loading, error } = useProducts({
    category: product.category.slug,
    min_price: Math.round(price * 0.6),
    max_price: Math.round(price * 1.4),
    sort: 'price_asc',
    limit: 5,
  })
  const items = data?.items.filter((p) => p.slug !== product.slug).slice(0, 4) ?? []
  if (error || (!loading && items.length === 0)) return null
  return (
    <section className="mt-14">
      <SectionHeader title="Similar products" subtitle={`Other ${product.category.name.toLowerCase()} in a similar price range`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />) : items.map((p) => <ProductCard key={p.slug} product={p} compact />)}
      </div>
    </section>
  )
}

export default function ProductDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: product, error, loading, reload } = useProduct(slug)
  const { compareIds, toggleCompare, savedProductIds, toggleSavedProduct } = useApp()

  const back = (
    <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app/search'))} className="btn-ghost -ml-2 mb-4 px-2 text-sm">
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  )

  // Also show the skeleton while switching from one product to another
  if (loading && (!product || product.slug !== slug)) return <div>{back}<DetailSkeleton /></div>

  if (error) {
    return (
      <div>
        {back}
        {error instanceof ApiError && error.isNotFound ? (
          <EmptyState icon={PackageX} title="Product not found" text="This product doesn’t exist or has been removed from the catalogue." action={<Link to="/app/search" className="btn-primary">Browse products</Link>} />
        ) : (
          <ErrorState title="Couldn’t load this product" message={errorMessage(error)} onRetry={reload} />
        )}
      </div>
    )
  }
  if (!product) return null

  const inCompare = compareIds.includes(product.slug)
  const saved = savedProductIds.includes(product.slug)
  const s = product.specifications
  const specRows = [
    { label: 'Processor', icon: Cpu, value: s?.processor },
    { label: 'RAM', icon: MemoryStick, value: s?.ram },
    { label: 'Storage', icon: HardDrive, value: s?.storage },
    { label: 'Battery', icon: Battery, value: s?.battery },
    { label: 'Display', icon: Monitor, value: s?.display },
    // Graphics only applies to some categories (mostly laptops)
    ...(s?.graphics || product.category.slug === 'laptops' ? [{ label: 'Graphics', icon: Zap, value: s?.graphics }] : []),
  ]

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/app/search" className="hover:text-slate-900">Search</Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        <Link to={`/app/search?category=${product.category.slug}`} className="hover:text-slate-900">{product.category.name}</Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        <span className="truncate text-slate-900" aria-current="page">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="card aspect-[4/3] p-4">
          <ProductThumb category={product.category.slug} imageUrl={product.image_url} alt={product.name} size="lg" />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-500">{product.brand}</p>
            <VerificationBadge status={product.verification_status} />
          </div>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900">{product.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Model {product.model} · {product.category.name}</p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{formatINR(product.price_inr)}</p>
          <p className="mt-1 text-xs text-slate-400">Price in Indian rupees{product.is_demo && ' · demo price, not a real listing'}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={() => toggleCompare(product.slug)} aria-pressed={inCompare} className={cn('flex-1 sm:flex-none', inCompare ? 'btn border border-navy-200 bg-navy-50 text-navy-900 hover:bg-navy-100' : 'btn-primary')}>
              {inCompare ? <GitCompareArrows className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {inCompare ? 'Added to compare' : 'Add to compare'}
            </button>
            <button onClick={() => toggleSavedProduct(product.slug)} aria-pressed={saved} className="btn-secondary flex-1 sm:flex-none">
              <Bookmark className={cn('h-4 w-4', saved && 'fill-navy-800 text-navy-800')} /> {saved ? 'Saved' : 'Save'}
            </button>
            {inCompare && compareIds.length >= 2 && (
              <Link to="/app/compare" className="btn-ghost">Compare {compareIds.length} →</Link>
            )}
          </div>

          {product.is_demo && (
            <div className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This is a <strong>fictional demo product</strong>. Its specifications and price are sample data for previewing Siftwell, not real-world information.</p>
            </div>
          )}

          <div className="card mt-6 overflow-hidden">
            <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900">Specifications</h2>
            <dl className="divide-y divide-slate-100">
              {specRows.map(({ label, icon: Icon, value }) => (
                <div key={label} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-3 text-sm sm:grid-cols-[160px_1fr]">
                  <dt className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4 text-slate-400" /> {label}</dt>
                  <dd className={value ? 'text-slate-900' : 'text-slate-400'}>{value ?? 'Not listed'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Last verified</p>
              <p className="mt-0.5 font-medium text-slate-900">{product.last_verified_date ? formatPlainDate(product.last_verified_date) : 'Not verified'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Source</p>
              {product.source_url ? (
                <a href={product.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 font-medium text-navy-800 hover:underline">
                  <span className="truncate">{hostname(product.source_url)}</span> <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ) : (
                <p className="mt-0.5 font-medium text-slate-400">{product.is_demo ? 'None (demo data)' : 'No source yet'}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <SimilarProducts product={product} />
    </div>
  )
}
