import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Bookmark, Clock, GitCompareArrows, Sparkles, TrendingDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SearchBox } from '../components/SearchBox'
import { ProductCard } from '../components/ProductCard'
import { DemoBadge, EmptyState, ProductThumb, Rating, SectionHeader } from '../components/ui'
import { examplePrompts, getProduct, products } from '../data/demo'
import { formatDate, formatPrice } from '../lib/format'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user, savedComparisons, savedProductIds, compareIds, preferences, toggleSavedProduct } = useApp()
  const navigate = useNavigate()
  const search = (q: string) => navigate(`/app/search?q=${encodeURIComponent(q)}`)

  const recommended = products
    .filter((p) => preferences.categories.length === 0 || preferences.categories.includes(p.category) || p.score >= 93)
    .filter((p) => p.price <= preferences.budgetMax)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
  const savedProducts = savedProductIds.map(getProduct).filter((p): p is NonNullable<typeof p> => !!p)
  const firstName = user?.name.split(' ')[0] ?? 'there'

  const stats = [
    { label: 'Saved comparisons', value: savedComparisons.length, icon: GitCompareArrows },
    { label: 'Saved products', value: savedProducts.length, icon: Bookmark },
    { label: 'In compare tray', value: compareIds.length, icon: Sparkles },
  ]

  return (
    <div className="space-y-10">
      {/* Welcome + search */}
      <section className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{greeting()}, {firstName}</h1>
        </div>
        <p className="mt-1.5 text-slate-500">What are you looking to buy today? Describe it and Siftwell will do the research.</p>
        <div className="mt-6 max-w-3xl">
          <SearchBox onSearch={search} />
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
        {savedComparisons.length === 0 ? (
          <EmptyState icon={GitCompareArrows} title="No comparisons yet" text="Search for products and add two or more to compare them side by side." action={<Link to="/app/search" className="btn-primary">Find products</Link>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {savedComparisons.slice(0, 3).map((c) => {
              const items = c.productIds.map(getProduct).filter((p): p is NonNullable<typeof p> => !!p)
              return (
                <Link key={c.id} to={`/app/compare?ids=${c.productIds.join(',')}`} className="card group p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{c.title}</h3>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500"><Clock className="h-3 w-3" /> {formatDate(c.createdAt)} · {items.length} products</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-navy-700" />
                  </div>
                  <div className="mt-5 flex -space-x-2">
                    {items.map((p) => (
                      <ProductThumb key={p.id} category={p.category} size="sm" className="h-10 w-10 bg-white ring-2 ring-white" />
                    ))}
                  </div>
                  <p className="mt-4 truncate text-sm text-slate-600">{items.map((p) => p.name).join(' vs ')}</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Recommended */}
      <section>
        <SectionHeader
          title="Recommended for you"
          subtitle={`Based on your preferences · up to ${formatPrice(preferences.budgetMax)}`}
          action={<DemoBadge />}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {recommended.map((p) => (
            <ProductCard key={p.id} product={p} compact />
          ))}
        </div>
      </section>

      {/* Saved products */}
      <section>
        <SectionHeader title="Saved products" subtitle="Products you’re keeping an eye on" />
        {savedProducts.length === 0 ? (
          <EmptyState icon={Bookmark} title="No saved products" text="Tap the bookmark on any product to keep track of it here." />
        ) : (
          <div className="card divide-y divide-slate-100">
            {savedProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50/60">
                <ProductThumb category={p.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{p.name}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                    <span>{p.brand}</span>
                    <Rating value={p.rating} className="text-xs" />
                  </div>
                </div>
                {i % 2 === 0 && (
                  <span className="hidden items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
                    <TrendingDown className="h-3 w-3" /> Price dropped (demo)
                  </span>
                )}
                <span className="w-20 text-right font-semibold text-slate-900">{formatPrice(p.price)}</span>
                <button onClick={() => toggleSavedProduct(p.id)} className="grid h-8 w-8 place-items-center rounded-lg text-navy-800 transition hover:bg-slate-100" aria-label={`Remove ${p.name} from saved`}>
                  <Bookmark className="h-4 w-4 fill-navy-800" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
