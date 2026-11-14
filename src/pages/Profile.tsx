import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Clock, History, Loader2, LogOut, Search, Shield, SlidersHorizontal, Trash2, User as UserIcon } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { EmptyState, ErrorState, Skeleton, categoryIcon } from '../components/ui'
import { useCategories } from '../hooks/useApi'
import { api, ApiError, errorMessage } from '../lib/api'
import { cn, formatDate, formatINR, formatINRShort } from '../lib/format'
import { searchUrl } from '../lib/prompt'

type Tab = 'profile' | 'preferences' | 'notifications' | 'history' | 'security'

const tabs: { id: Tab; label: string; icon: typeof UserIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'preferences', label: 'Shopping preferences', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'history', label: 'Search history', icon: History },
  { id: 'security', label: 'Security', icon: Shield },
]

const allPriorities = ['Battery life', 'Build quality', 'Value for money', 'Performance', 'Portability', 'Design', 'Sustainability', 'Warranty & support']

/** Turn validation details from the API into one readable line. */
function describeError(err: unknown): string {
  if (err instanceof ApiError && Array.isArray(err.details) && err.details.length) {
    return (err.details as { field?: string; message: string }[]).map((d) => d.message.replace(/^Value error, /, '')).join(' · ')
  }
  return errorMessage(err)
}

function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-navy-900' : 'bg-slate-300')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  )
}

function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
  if (success) return <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>
  return null
}

// ---------------------------------------------------------------------------
function ProfileTab() {
  const { user, updateUser, notify } = useApp()
  const [form, setForm] = useState({ name: user?.name ?? '', location: user?.location ?? '', currency: user?.currency ?? 'INR' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = !!user && (form.name !== user.name || form.location !== user.location || form.currency !== user.currency)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError('Please enter your name (at least 2 characters).')
    setSaving(true)
    setError(null)
    try {
      await updateUser(form)
      notify('Profile updated')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save}>
      <h2 className="font-semibold text-slate-900">Personal information</h2>
      <p className="mt-1 text-sm text-slate-500">Saved to your Siftwell account.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="p-name" className="label">Full name</label>
          <input id="p-name" className="input" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="p-email" className="label">Email</label>
          <input id="p-email" type="email" className="input bg-slate-50 text-slate-500" value={user?.email ?? ''} readOnly aria-describedby="p-email-help" />
          <p id="p-email-help" className="mt-1 text-xs text-slate-400">Your login email can’t be changed yet.</p>
        </div>
        <div>
          <label htmlFor="p-loc" className="label">Location</label>
          <input id="p-loc" className="input" value={form.location} maxLength={100} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bengaluru" />
        </div>
        <div>
          <label htmlFor="p-cur" className="label">Currency</label>
          <select id="p-cur" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-400">Prices in the catalogue are listed in INR.</p>
        </div>
      </div>
      <FormMessage error={error} />
      <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-5">
        <button type="button" disabled={!dirty || saving} onClick={() => user && setForm({ name: user.name, location: user.location, currency: user.currency })} className="btn-ghost">Reset</button>
        <button type="submit" disabled={!dirty || saving} className="btn-primary">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
function PreferencesTab() {
  const { preferences, updatePreferences, notify } = useApp()
  const [prefs, setPrefs] = useState(preferences)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categories = useCategories()
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const dirty = JSON.stringify(prefs) !== JSON.stringify(preferences)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updatePreferences(prefs)
      notify('Preferences saved')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="font-semibold text-slate-900">Shopping preferences</h2>
      <p className="mt-1 text-sm text-slate-500">Used for the “Picks within your budget” section on your dashboard.</p>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <span className="label mb-0">Typical maximum budget</span>
          <span className="text-sm font-semibold text-slate-900">{formatINR(prefs.budgetMax)}</span>
        </div>
        <input type="range" min={10000} max={300000} step={5000} value={prefs.budgetMax} onChange={(e) => setPrefs({ ...prefs, budgetMax: Number(e.target.value) })} className="mt-3 w-full accent-navy-900" aria-label="Maximum budget" />
      </div>

      <div className="mt-8">
        <span className="label">Categories you shop for</span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.loading && <Skeleton className="col-span-2 h-11" />}
          {categories.error && <div className="col-span-full"><ErrorState compact message={errorMessage(categories.error)} onRetry={categories.reload} /></div>}
          {categories.data?.map((c) => {
            const Icon = categoryIcon(c.slug)
            const on = prefs.categories.includes(c.slug)
            return (
              <button key={c.slug} onClick={() => setPrefs({ ...prefs, categories: toggleIn(prefs.categories, c.slug) })} aria-pressed={on} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition', on ? 'border-navy-800 bg-navy-50 font-medium text-navy-900' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                <Icon className="h-4 w-4" /> {c.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-8">
        <span className="label">What matters most to you</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {allPriorities.map((p) => {
            const on = prefs.priorities.includes(p)
            return (
              <button key={p} onClick={() => setPrefs({ ...prefs, priorities: toggleIn(prefs.priorities, p) })} aria-pressed={on} className={cn('rounded-full border px-3.5 py-1.5 text-sm transition', on ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                {p}
              </button>
            )
          })}
        </div>
      </div>

      <FormMessage error={error} />
      <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-5">
        <button onClick={() => setPrefs(preferences)} disabled={!dirty || saving} className="btn-ghost">Discard</button>
        <button onClick={save} disabled={!dirty || saving} className="btn-primary">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save preferences
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function NotificationsTab() {
  const { preferences, updatePreferences, notify } = useApp()
  const [pending, setPending] = useState(false)
  const change = async (patch: { priceAlerts?: boolean; emailDigest?: boolean }) => {
    setPending(true)
    try {
      await updatePreferences(patch)
      notify('Notification settings saved')
    } catch (err) {
      notify(`Couldn’t save: ${describeError(err)}`)
    } finally {
      setPending(false)
    }
  }
  return (
    <div>
      <h2 className="font-semibold text-slate-900">Notifications</h2>
      <p className="mt-1 text-sm text-slate-500">Your choices are saved to your account. Siftwell doesn’t send any emails yet — these will apply once it does.</p>
      <div className="mt-4 divide-y divide-slate-100">
        <Toggle label="Price-drop alerts" description="When a saved product drops below its recent average price." checked={preferences.priceAlerts} disabled={pending} onChange={(v) => change({ priceAlerts: v })} />
        <Toggle label="Weekly digest" description="A short summary of new products in your categories." checked={preferences.emailDigest} disabled={pending} onChange={(v) => change({ emailDigest: v })} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function HistoryTab() {
  const { searchHistory, historyState, deleteSearch, clearSearchHistory, reloadUserData, notify } = useApp()
  const [busy, setBusy] = useState<number | 'all' | null>(null)

  const remove = async (id: number) => {
    setBusy(id)
    try {
      await deleteSearch(id)
    } catch (err) {
      notify(`Couldn’t delete: ${errorMessage(err)}`)
    } finally {
      setBusy(null)
    }
  }
  const clearAll = async () => {
    if (!confirm('Clear your whole search history? This can’t be undone.')) return
    setBusy('all')
    try {
      await clearSearchHistory()
      notify('Search history cleared')
    } catch (err) {
      notify(`Couldn’t clear: ${errorMessage(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const filterChips = (f: (typeof searchHistory)[number]['filters']) =>
    [
      f.category,
      f.min_price || f.max_price ? (f.min_price && f.max_price ? `${formatINRShort(f.min_price)}–${formatINRShort(f.max_price)}` : f.max_price ? `Under ${formatINRShort(f.max_price)}` : `Above ${formatINRShort(f.min_price!)}`) : null,
      ...(f.brands ?? []),
    ].filter(Boolean) as string[]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Search history</h2>
          <p className="mt-1 text-sm text-slate-500">Your recent searches, visible only to you.</p>
        </div>
        {searchHistory.length > 0 && (
          <button onClick={clearAll} disabled={busy !== null} className="btn-secondary py-2 text-xs text-rose-700">
            {busy === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Clear all
          </button>
        )}
      </div>
      <div className="mt-5">
        {historyState === 'loading' && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {historyState === 'error' && <ErrorState compact message="Couldn’t load your search history." onRetry={reloadUserData} />}
        {historyState === 'ready' && searchHistory.length === 0 && (
          <EmptyState icon={Search} title="No searches yet" text="Searches you run will appear here so you can repeat them." action={<Link to="/app/search" className="btn-primary">Start searching</Link>} />
        )}
        {searchHistory.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {searchHistory.map((h) => (
              <li key={h.id} className="flex items-start gap-3 px-4 py-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <Link to={searchUrl(h.query)} className="block truncate text-sm font-medium text-slate-900 hover:text-navy-800" title="Search again">{h.query}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{formatDate(h.created_at)}</span>
                    {filterChips(h.filters).map((c) => <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5">{c}</span>)}
                  </div>
                </div>
                <button onClick={() => remove(h.id)} disabled={busy !== null} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50" aria-label={`Delete search “${h.query}”`}>
                  {busy === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function SecurityTab() {
  const { applyToken, forgetSession, notify } = useApp()
  const navigate = useNavigate()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwState, setPwState] = useState<{ saving: boolean; error: string | null; success: string | null }>({ saving: false, error: null, success: null })
  const [loggingOut, setLoggingOut] = useState(false)
  const [del, setDel] = useState({ password: '', confirm: false })
  const [delState, setDelState] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null })

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.next.length < 8) return setPwState({ saving: false, error: 'New password must be at least 8 characters.', success: null })
    if (pw.next !== pw.confirm) return setPwState({ saving: false, error: 'The new passwords don’t match.', success: null })
    setPwState({ saving: true, error: null, success: null })
    try {
      applyToken(await api.changePassword(pw.current, pw.next))
      setPw({ current: '', next: '', confirm: '' })
      setPwState({ saving: false, error: null, success: 'Password changed. You’ve been logged out on your other devices.' })
    } catch (err) {
      setPwState({ saving: false, error: describeError(err), success: null })
    }
  }

  const logoutEverywhere = async () => {
    if (!confirm('Log out on every device, including this one?')) return
    setLoggingOut(true)
    try {
      await api.logoutAll()
      navigate('/login', { replace: true })
      forgetSession()
    } catch (err) {
      notify(`Couldn’t log out everywhere: ${errorMessage(err)}`)
      setLoggingOut(false)
    }
  }

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault()
    setDelState({ saving: true, error: null })
    try {
      await api.deleteAccount(del.password)
      // Leave the protected area first, then clear the session (otherwise the login redirect wins)
      navigate('/', { replace: true })
      forgetSession()
      notify('Your account and data were deleted.')
    } catch (err) {
      setDelState({ saving: false, error: describeError(err) })
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={changePassword}>
        <h2 className="font-semibold text-slate-900">Change password</h2>
        <p className="mt-1 text-sm text-slate-500">Use at least 8 characters. Your other devices will be logged out.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pw-current" className="label">Current password</label>
            <input id="pw-current" type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          </div>
          <div>
            <label htmlFor="pw-new" className="label">New password</label>
            <input id="pw-new" type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required minLength={8} maxLength={128} />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="label">Confirm new password</label>
            <input id="pw-confirm" type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
          </div>
        </div>
        <FormMessage error={pwState.error} success={pwState.success} />
        <div className="mt-5 flex justify-end">
          <button type="submit" disabled={pwState.saving || !pw.current || !pw.next} className="btn-primary">
            {pwState.saving && <Loader2 className="h-4 w-4 animate-spin" />} Change password
          </button>
        </div>
      </form>

      <div className="border-t border-slate-100 pt-8">
        <h2 className="font-semibold text-slate-900">Sessions</h2>
        <p className="mt-1 text-sm text-slate-500">Lost a device or used a shared computer? End every session at once.</p>
        <button onClick={logoutEverywhere} disabled={loggingOut} className="btn-secondary mt-4">
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Log out on all devices
        </button>
      </div>

      <form onSubmit={deleteAccount} className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
        <h2 className="font-semibold text-rose-900">Delete account</h2>
        <p className="mt-1 text-sm text-rose-800/80">Permanently deletes your account, saved comparisons, saved products and search history. This can’t be undone.</p>
        <div className="mt-4 max-w-sm">
          <label htmlFor="del-pw" className="label">Confirm with your password</label>
          <input id="del-pw" type="password" className="input" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} autoComplete="current-password" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-rose-900">
          <input type="checkbox" checked={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.checked })} className="h-4 w-4 rounded border-rose-300 accent-rose-700" />
          I understand this permanently deletes my data
        </label>
        <FormMessage error={delState.error} />
        <button type="submit" disabled={!del.password || !del.confirm || delState.saving} className="btn mt-4 bg-rose-700 text-white hover:bg-rose-800">
          {delState.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete my account
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function ProfilePage() {
  const { user, logout } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash = window.location.hash.slice(1) as Tab
    return tabs.some((t) => t.id === fromHash) ? fromHash : 'profile'
  })
  useEffect(() => {
    window.history.replaceState(null, '', `#${tab}`)
    // On narrow screens the tab strip scrolls sideways: keep the selected tab visible
    document.querySelector('[role=tab][aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  const initials = (user?.name ?? 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile & settings</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your account and how Siftwell personalises results.</p>

      <div className="card mt-6 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-900 text-lg font-semibold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{user?.name}</p>
          <p className="truncate text-sm text-slate-500">{user?.email}</p>
        </div>
        {user?.created_at && <p className="text-xs text-slate-400">Member since {formatDate(user.created_at)}</p>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" role="tablist" aria-label="Settings sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn('flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition', tab === t.id ? 'bg-white text-navy-900 shadow-soft ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900')}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
          <button onClick={() => { navigate('/'); void logout() }} className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 lg:mt-4">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </nav>

        <div className="card animate-fade-in p-6" key={tab}>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'security' && <SecurityTab />}
        </div>
      </div>
    </div>
  )
}
