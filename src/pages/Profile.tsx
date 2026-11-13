import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CreditCard, LogOut, SlidersHorizontal, User as UserIcon } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { DemoBadge, ErrorState, Skeleton, categoryIcon } from '../components/ui'
import { useCategories } from '../hooks/useApi'
import { errorMessage } from '../lib/api'
import { cn, formatINR } from '../lib/format'

type Tab = 'profile' | 'preferences' | 'notifications' | 'billing'

const tabs: { id: Tab; label: string; icon: typeof UserIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'preferences', label: 'Shopping preferences', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard },
]

const allPriorities = ['Battery life', 'Build quality', 'Value for money', 'Performance', 'Portability', 'Design', 'Sustainability', 'Warranty & support']

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-navy-900' : 'bg-slate-300')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  )
}

export default function ProfilePage() {
  const { user, updateUser, preferences, updatePreferences, logout, notify } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('profile')
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', location: user?.location ?? '', currency: user?.currency ?? 'INR' })
  const [prefs, setPrefs] = useState(preferences)
  const categories = useCategories()

  const initials = (user?.name ?? 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  const saveProfile = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return notify('Name cannot be empty')
    updateUser(form)
    notify('Profile updated')
  }
  const savePrefs = () => {
    updatePreferences(prefs)
    notify('Preferences saved')
  }
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile & settings</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your account and tune how Siftwell ranks products for you.</p>

      <div className="card mt-6 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-900 text-lg font-semibold text-white">{initials}</div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{user?.name}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
        <span className="rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-800 ring-1 ring-inset ring-navy-100">{user?.plan}</span>
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
          <button onClick={() => { logout(); navigate('/') }} className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 lg:mt-4">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </nav>

        <div className="card animate-fade-in p-6" key={tab}>
          {tab === 'profile' && (
            <form onSubmit={saveProfile}>
              <h2 className="font-semibold text-slate-900">Personal information</h2>
              <p className="mt-1 text-sm text-slate-500">This is stored locally in your browser for this preview.</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="p-name" className="label">Full name</label>
                  <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="p-email" className="label">Email</label>
                  <input id="p-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="p-loc" className="label">Location</label>
                  <input id="p-loc" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="p-cur" className="label">Currency</label>
                  <select id="p-cur" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-5">
                <button type="button" onClick={() => user && setForm({ name: user.name, email: user.email, location: user.location, currency: user.currency })} className="btn-ghost">Reset</button>
                <button type="submit" className="btn-primary">Save changes</button>
              </div>
            </form>
          )}

          {tab === 'preferences' && (
            <div>
              <h2 className="font-semibold text-slate-900">Shopping preferences</h2>
              <p className="mt-1 text-sm text-slate-500">Siftwell uses these to personalise recommendations on your dashboard.</p>

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

              <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-5">
                <button onClick={() => setPrefs(preferences)} className="btn-ghost">Discard</button>
                <button onClick={savePrefs} className="btn-primary">Save preferences</button>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div>
              <h2 className="font-semibold text-slate-900">Notifications</h2>
              <p className="mt-1 text-sm text-slate-500">Choose what Siftwell emails you about.</p>
              <div className="mt-4 divide-y divide-slate-100">
                <Toggle label="Price-drop alerts" description="When a saved product drops below its recent average price." checked={prefs.priceAlerts} onChange={(v) => { setPrefs({ ...prefs, priceAlerts: v }); updatePreferences({ priceAlerts: v }); notify('Notification settings updated') }} />
                <Toggle label="Weekly digest" description="A short summary of new products in your categories." checked={prefs.emailDigest} onChange={(v) => { setPrefs({ ...prefs, emailDigest: v }); updatePreferences({ emailDigest: v }); notify('Notification settings updated') }} />
              </div>
            </div>
          )}

          {tab === 'billing' && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-900">Plan & billing</h2>
                <DemoBadge />
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  { name: 'Free', price: '₹0', features: ['10 AI searches / month', '3 saved comparisons', 'Core categories'] },
                  { name: 'Pro', price: '₹299', features: ['Unlimited AI searches', 'Unlimited saved comparisons', 'Price-drop alerts', 'Priority support'], current: true },
                ].map((p) => (
                  <div key={p.name} className={cn('rounded-2xl border p-5', p.current ? 'border-navy-800 ring-4 ring-navy-50' : 'border-slate-200')}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {p.current && <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-medium text-white">Current</span>}
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{p.price}<span className="text-sm font-normal text-slate-500"> / month</span></p>
                    <ul className="mt-4 space-y-1.5 text-sm text-slate-600">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-slate-500">Billing will be enabled once payments are connected to the backend.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
