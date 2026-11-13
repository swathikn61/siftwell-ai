import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bookmark, GitCompareArrows, LayoutDashboard, LogOut, Menu, Search, Settings, X, Sparkles, HelpCircle, WifiOff,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync, useProductsBySlugs } from '../hooks/useApi'
import { api, ApiError, API_URL } from '../lib/api'
import { cn } from '../lib/format'
import { DemoBadge, Logo, ProductThumb } from './ui'

const nav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/search', label: 'Product search', icon: Search },
  { to: '/app/compare', label: 'Compare', icon: GitCompareArrows },
  { to: '/app/saved', label: 'Saved comparisons', icon: Bookmark },
  { to: '/app/profile', label: 'Profile & settings', icon: Settings },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout, compareIds, savedComparisons } = useApp()
  const navigate = useNavigate()
  const counts: Record<string, number | undefined> = {
    '/app/compare': compareIds.length || undefined,
    '/app/saved': savedComparisons.length || undefined,
  }
  const initials = (user?.name ?? 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo to="/app" />
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-white text-navy-900 shadow-soft ring-1 ring-slate-200/80' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-navy-700' : 'text-slate-400 group-hover:text-slate-600')} />
                <span className="flex-1">{label}</span>
                {counts[to] && (
                  <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{counts[to]}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-navy-600" /> Siftwell Pro
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Unlimited AI comparisons and price-drop alerts.</p>
        <DemoBadge className="mt-3" label="Preview build" />
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200/80 p-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/')
          }}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function CompareTray() {
  const { compareIds, toggleCompare, clearCompare } = useApp()
  const { pathname } = useLocation()
  const { bySlug } = useProductsBySlugs(compareIds)
  if (!compareIds.length || pathname.startsWith('/app/compare')) return null
  return (
    <div className="animate-fade-up fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-64">
      <div className="flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2.5 pl-4 shadow-lift backdrop-blur">
        <div className="hidden text-sm font-medium text-slate-700 sm:block">Compare</div>
        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {compareIds.map((slug) => {
            const p = bySlug.get(slug)
            return (
              <div key={slug} className="group relative" title={p?.name ?? 'Loading…'}>
                <ProductThumb category={p?.category.slug} imageUrl={p?.image_url} size="sm" className="h-10 w-10" />
                <button
                  onClick={() => toggleCompare(slug)}
                  aria-label={`Remove ${p?.name ?? slug} from compare`}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          <span className="ml-1 whitespace-nowrap text-xs text-slate-400">{compareIds.length}/4 selected</span>
        </div>
        <button onClick={clearCompare} className="btn-ghost px-3 py-2 text-xs">Clear</button>
        <Link to="/app/compare" className={cn('btn-primary py-2', compareIds.length < 2 && 'pointer-events-none opacity-50')} aria-disabled={compareIds.length < 2}>
          Compare now
        </Link>
      </div>
    </div>
  )
}

/** Shows a banner when the backend can't be reached, with a retry button. */
function ApiStatusBanner() {
  const { pathname } = useLocation()
  const { data, error, reload } = useAsync((signal) => api.health(signal), [pathname])
  // Remember the last result so the banner doesn't flicker while re-checking
  const [lastError, setLastError] = useState<Error>()
  useEffect(() => {
    if (error) setLastError(error)
    else if (data) setLastError(undefined)
  }, [error, data])
  // While the API is down, quietly check again every 5 seconds so the banner clears by itself
  useEffect(() => {
    if (!lastError) return
    const t = window.setInterval(reload, 5000)
    return () => window.clearInterval(t)
  }, [lastError, reload])
  if (!lastError) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 sm:px-6 lg:px-8">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {lastError instanceof ApiError && !lastError.isNetwork ? (
          <>The Siftwell API is running, but its database isn’t reachable. Product data may not load.</>
        ) : (
          <>Can’t reach the Siftwell API at <code className="rounded bg-rose-100 px-1">{API_URL}</code>. Product data won’t load until the backend is running.</>
        )}
      </span>
      <button onClick={reload} className="font-medium underline-offset-2 hover:underline">Retry</button>
    </div>
  )
}

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-slate-50 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="animate-fade-in absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="animate-fade-up absolute inset-y-0 left-0 w-72 border-r border-slate-200 bg-slate-50 shadow-lift">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo to="/app" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block">
              <DemoBadge label="Demo data — UI preview" />
            </span>
            <a href="mailto:support@siftwell.example" className="btn-ghost h-9 px-2.5" aria-label="Help">
              <HelpCircle className="h-4 w-4" />
            </a>
          </div>
        </header>
        <ApiStatusBanner />
        <main className="mx-auto max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Outlet />
        </main>
      </div>
      <CompareTray />
    </div>
  )
}
