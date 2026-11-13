import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Bookmark, Clock, GitCompareArrows, PackageSearch, Sparkles } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SearchBox } from '../components/SearchBox'
import { ProductCard, productPath } from '../components/ProductCard'
import { EmptyState, ErrorState, ProductCardSkeleton, ProductThumb, SectionHeader, Skeleton, VerificationBadge } from '../components/ui'
import { examplePrompts } from '../data/demo'
import { useProducts, useProductsBySlugs } from '../hooks/useApi'
import { errorMessage } from '../lib/api'
import { formatDate, formatINR } from '../lib/format'
import { searchUrl } from '../lib/prompt'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user, savedComparisons, savedProductIds, compareIds, preferences, toggleSavedProduct } = useApp()
  const navigate = useNavigate()
  const search = (q: string) => navigate(searchUrl(q))
  const firstName = user?.name.split(' ')[0] ?? 'there'

  // Recommendations: the best-specced products that fit the preferred budget/category
  const preferredCategory = preferences.categories.length === 1 ? preferences.categories[0] : undefined
  const recommended = useProducts({ category: preferredCategory, max_price: preferences.budgetMax, sort: 'price_desc', limit: 4 })

  const recentComparisons = savedComparisons.slice(0, 3)
  const comparisonSlugs = useMemo(() => [...new Set(recentComparisons.flatMap((c) => c.productSlugs))], [recentComparisons])
  const comparisonProducts = useProductsBySlugs(comparisonSlugs)
  const saved = useProductsBySlugs(savedProductIds)

  const stats = [
    { label: 'Saved comparisons', value: savedComparisons.length, icon: GitCompareArrows },
    { label: 'Saved products', value: savedProductIds.length, icon: Bookmark },
    { label: 'In compare tray', value: compareIds.length, icon: Sparkles },
  ]

  return (
    <div className="space-y-10">
      <section className="animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{greeting()}, {firstName}</h1>
        <p className="mt-1.5 text-slate-500">What are you looking to buy? Describe it and Siftwell will narrow down the options.</p>
        <div className="mt-6 max-w-3xl">
          <SearchBox onSearch={search} placeholder="e.g. “laptop under ₹80,000 with 16 GB RAM”" />
          <div className="mt-3 flex flex-wrap gap-2">
            {examplePrompts.slice(0, 3).map((p) => (
              <button key={p} onClick={() => search(p)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-navy-200 hover:bg-navy-50 hover:text-navy-900">
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="card flex items-center gap-4 p-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-navy-800">
                <s.icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent comparisons */}
      <section>
        <SectionHeader
          title="Recent comparisons"
          subtitle="Pick up where you left off"
          action={<Link to="/app/saved" className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}
        />
        {recentComparisons.length === 0 ? (
          <EmptyState icon={GitCompareArrows} title="No comparisons yet" text="Search for products and add two or more to compare them side by side." action={<Link to="/app/search" className="btn-primary">Find products</Link>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentComparisons.map((c) => {
              const items = c.productSlugs.map((s) => comparisonProducts.bySlug.get(s)).filter((p) => !!p)
              return (
                <Link key={c.id} to={`/app/compare?ids=${c.productSlugs.join(',')}`} className="card group p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{c.title}</h3>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500"><Clock className="h-3 w-3" /> {formatDate(c.createdAt)} · {c.productSlugs.length} products</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-navy-700" />
                  </div>
                  <div className="mt-5 flex -space-x-2">
                    {c.productSlugs.map((slug) => {
                      const p = comparisonProducts.bySlug.get(slug)
                      return <ProductThumb key={slug} category={p?.category.slug} imageUrl={p?.image_url} size="sm" className="h-10 w-10 bg-white ring-2 ring-white" />
                    })}
                  </div>
                  {comparisonProducts.loading && items.length === 0 ? (
                    <Skeleton className="mt-4 h-4 w-3/4" />
                  ) : (
                    <p className="mt-4 truncate text-sm text-slate-600">{items.map((p) => p.name).join(' vs ') || 'Products unavailable'}</p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Recommended */}
      <section>
        <SectionHeader
          title="Picks within your budget"
          subtitle={`Up to ${formatINR(preferences.budgetMax)}${preferredCategory ? ` · ${preferredCategory}` : ''} · change this in Profile`}
          action={<Link to={`/app/search?max=${preferences.budgetMax}${preferredCategory ? `&category=${preferredCategory}` : ''}`} className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">See all <ArrowRight className="h-3.5 w-3.5" /></Link>}
        />
        {recommended.error ? (
          <ErrorState title="Couldn’t load recommendations" message={errorMessage(recommended.error)} onRetry={recommended.reload} />
        ) : recommended.loading && !recommended.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
        ) : !recommended.data?.items.length ? (
          <EmptyState icon={PackageSearch} title="Nothing within your budget yet" text={`No products are priced at or below ${formatINR(preferences.budgetMax)}. Try raising your budget in Profile.`} action={<Link to="/app/profile" className="btn-secondary">Update preferences</Link>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recommended.data.items.map((p) => <ProductCard key={p.slug} product={p} compact />)}
          </div>
        )}
      </section>

      {/* Saved products */}
      <section>
        <SectionHeader title="Saved products" subtitle="Products you’re keeping an eye on" />
        {savedProductIds.length === 0 ? (
          <EmptyState icon={Bookmark} title="No saved products" text="Tap the bookmark on any product to keep track of it here." />
        ) : saved.error ? (
          <ErrorState compact title="Couldn’t load saved products" message={errorMessage(saved.error)} onRetry={saved.reload} />
        ) : saved.loading ? (
          <div className="card divide-y divide-slate-100">{savedProductIds.map((s) => <div key={s} className="p-4"><Skeleton className="h-10 w-full" /></div>)}</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {saved.products.map((p) => (
              <div key={p.slug} className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50/60">
                <ProductThumb category={p.category.slug} imageUrl={p.image_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link to={productPath(p)} className="block truncate font-medium text-slate-900 hover:text-navy-800">{p.name}</Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span>{p.brand} · {p.category.name}</span>
                    <VerificationBadge status={p.verification_status} className="hidden sm:inline-flex" />
                  </div>
                </div>
                <span className="text-right font-semibold text-slate-900">{formatINR(p.price_inr)}</span>
                <button onClick={() => toggleSavedProduct(p.slug)} className="grid h-8 w-8 place-items-center rounded-lg text-navy-800 transition hover:bg-slate-100" aria-label={`Remove ${p.name} from saved`}>
                  <Bookmark className="h-4 w-4 fill-navy-800" />
                </button>
              </div>
            ))}
            {saved.missing.map((slug) => (
              <div key={slug} className="flex items-center gap-4 p-4 text-sm text-slate-400">
                <span className="flex-1">A saved product is no longer in the catalogue.</span>
                <button onClick={() => toggleSavedProduct(slug)} className="text-xs font-medium text-slate-600 hover:underline">Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
