import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, BadgeCheck, BarChart3, Bell, Bookmark, GitCompareArrows, MessageSquareText, ScanSearch, ShieldCheck, Sparkles, Wallet,
} from 'lucide-react'
import { Footer, Navbar } from '../components/MarketingLayout'
import { SearchBox } from '../components/SearchBox'
import { DemoBadge, ProductThumb, Rating, categoryIcons } from '../components/ui'
import { categories, examplePrompts, getProduct, products } from '../data/demo'
import { formatPrice } from '../lib/format'

const steps = [
  { icon: MessageSquareText, title: 'Describe what you need', text: 'Tell Siftwell your budget, how you will use it and what matters most — in plain language.' },
  { icon: ScanSearch, title: 'We sift the market', text: 'Our AI analyses specs, expert reviews and real owner feedback to shortlist the best matches.' },
  { icon: GitCompareArrows, title: 'Compare and decide', text: 'See the trade-offs side by side with a clear recommendation, then save it for later.' },
]

const features = [
  { icon: Sparkles, title: 'Natural-language search', text: 'No filters to fiddle with. Ask the way you would ask a knowledgeable friend.' },
  { icon: Wallet, title: 'Budget-aware ranking', text: 'Every recommendation respects your price range and highlights the best value.' },
  { icon: BarChart3, title: 'Side-by-side comparisons', text: 'Specs, pros and cons aligned so the differences that matter stand out.' },
  { icon: ShieldCheck, title: 'Unbiased by design', text: 'Rankings are based on fit for your needs — never on who pays for placement.' },
  { icon: Bookmark, title: 'Saved comparisons', text: 'Keep shortlists, add notes and come back when you are ready to buy.' },
  { icon: Bell, title: 'Price-drop alerts', text: 'Get notified when a product you are watching hits your target price.' },
]

export default function Landing() {
  const navigate = useNavigate()
  const search = (q: string) => navigate(`/app/search?q=${encodeURIComponent(q)}`)
  const preview = ['lp-aurora-14', 'lp-slate-13', 'lp-vertex-16'].map((id) => getProduct(id)!)

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,var(--color-slate-100),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(to_right,rgb(226_232_240/0.45)_1px,transparent_1px),linear-gradient(to_bottom,rgb(226_232_240/0.45)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AI-powered product comparison
          </div>
          <h1 className="animate-fade-up mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 [animation-delay:60ms] sm:text-6xl">
            Find the right product.
            <br />
            <span className="text-navy-800">Make the right decision.</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 [animation-delay:120ms] sm:text-lg">
            Siftwell reads the specs, reviews and prices for you. Describe your budget, needs and preferences, and get a clear,
            unbiased shortlist with side-by-side comparisons in seconds.
          </p>
          <div className="animate-fade-up mx-auto mt-10 max-w-2xl [animation-delay:180ms]">
            <SearchBox onSearch={search} />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {examplePrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => search(p)}
                  className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs text-slate-600 transition hover:border-navy-200 hover:bg-navy-50 hover:text-navy-900 sm:text-sm"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-navy-600" /> Free to start</span>
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-navy-600" /> No sponsored rankings</span>
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-navy-600" /> 8 categories</span>
          </div>
        </div>

        {/* Product preview */}
        <div className="relative mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          <div className="card overflow-hidden p-2 shadow-lift">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Sparkles className="h-4 w-4 text-navy-600" />
                  <span>“Best laptop under $2,000 for coding and travel”</span>
                </div>
                <DemoBadge />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {preview.map((p, i) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
                    <div className="flex items-center gap-3">
                      <ProductThumb category={p.category} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.brand}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{formatPrice(p.price)}</span>
                      <Rating value={p.rating} />
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Match</span>
                        <span className="font-medium text-slate-800">{p.score}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-navy-800" style={{ width: `${p.score}%` }} />
                      </div>
                    </div>
                    {i === 0 && (
                      <p className="mt-3 inline-flex items-center gap-1 rounded-md bg-navy-50 px-2 py-1 text-[11px] font-medium text-navy-800">
                        <BadgeCheck className="h-3 w-3" /> Best overall for you
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-slate-100 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">From question to confident decision</h2>
            <p className="mt-4 text-slate-600">Three simple steps replace hours of tabs, spreadsheets and conflicting reviews.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="card relative p-7 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                <span className="absolute right-6 top-6 text-sm font-semibold text-slate-300">0{i + 1}</span>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-navy-900 text-white">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-3">
            <div>
              <p className="eyebrow">Features</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Everything you need to choose well</h2>
              <p className="mt-4 text-slate-600">Built for people who want the best product for them — not the one with the biggest ad budget.</p>
              <Link to="/signup" className="btn-primary mt-8">
                Start comparing <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:col-span-2">
              {features.map((f) => (
                <div key={f.title} className="group bg-white p-7 transition-colors hover:bg-slate-50/70">
                  <f.icon className="h-5 w-5 text-navy-700 transition-transform duration-300 group-hover:scale-110" />
                  <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="scroll-mt-20 border-t border-slate-100 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Categories</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Explore by category</h2>
            </div>
            <p className="max-w-sm text-sm text-slate-600">Start with a category, then refine with your own words.</p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.map((c) => {
              const Icon = categoryIcons[c.id]
              const count = products.filter((p) => p.category === c.id).length
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/app/search?category=${c.id}`)}
                  className="card group p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lift"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-navy-900 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-semibold text-slate-900">{c.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{c.description}</p>
                  <p className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-navy-700">
                    {count} demo products <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-navy-950 px-6 py-16 text-center sm:px-12">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_50%_120%,rgb(42_59_119/0.5),transparent)]" />
            <h2 className="relative text-3xl font-semibold tracking-tight text-white sm:text-4xl">Stop second-guessing your purchases.</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-navy-200">Join Siftwell and make every buying decision with clarity.</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/signup" className="btn bg-white text-navy-950 shadow-soft hover:bg-slate-100">Create free account</Link>
              <Link to="/login" className="btn border border-white/20 text-white hover:bg-white/10">Log in</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
