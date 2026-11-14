import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2, Quote } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { errorMessage } from '../lib/api'
import { DemoBadge, Logo } from '../components/ui'

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <Link to="/" className="btn-ghost px-2.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="animate-fade-up">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <p className="mt-8 text-center text-sm text-slate-500">{footer}</p>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">
          Passwords are stored securely hashed. Product data shown is demo data.
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_20%,rgb(52_74_146/0.45),transparent)]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo light tagline />
          <div className="max-w-md">
            <Quote className="h-8 w-8 text-navy-400" />
            <p className="mt-6 text-2xl font-medium leading-snug text-white">
              “I used to spend whole weekends researching a new laptop. Siftwell gave me a shortlist I trusted in five minutes.”
            </p>
            <div className="mt-8 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-sm font-semibold text-white">JR</div>
              <div>
                <p className="text-sm font-medium text-white">Jordan R.</p>
                <p className="text-sm text-navy-300">Product designer</p>
              </div>
            </div>
            <DemoBadge className="mt-6 border-white/15 bg-white/5 text-navy-200" label="Sample testimonial" />
          </div>
          <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
            {[['8', 'Categories'], ['3 steps', 'To a decision'], ['0', 'Sponsored rankings']].map(([n, l]) => (
              <div key={l}>
                <p className="text-xl font-semibold text-white">{n}</p>
                <p className="mt-1 text-xs text-navy-300">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function useAuthRedirect() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const target = redirect && redirect.startsWith('/app') ? redirect : '/app'
  return { redirect, go: () => navigate(target, { replace: true }) }
}

function PasswordField({ value, onChange, autoComplete, error }: { value: string; onChange: (v: string) => void; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id="password"
        type={show ? 'text' : 'password'}
        className="input pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder="••••••••"
        aria-invalid={!!error}
      />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export function Login() {
  const { go, redirect } = useAuthRedirect()
  const { login } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!emailOk(email)) next.email = 'Enter a valid email address'
    if (password.length < 6) next.password = 'Password must be at least 6 characters'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setServerError(null)
    try {
      await login(email, password, remember)
      go()
    } catch (err) {
      setServerError(errorMessage(err))
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={redirect ? 'Log in to continue to your search.' : 'Log in to your Siftwell account.'}
      footer={<>Don’t have an account? <Link to={`/signup${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-medium text-navy-800 hover:underline">Sign up</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} />
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">Password</label>
          </div>
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
          {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-navy-900" /> Keep me signed in
        </label>
        {serverError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{serverError}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Log in
        </button>
      </form>
    </AuthShell>
  )
}

export function Signup() {
  const { go, redirect } = useAuthRedirect()
  const { register } = useApp()
  const [serverError, setServerError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const strength = [password.length >= 8, /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
  const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][strength]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Enter your full name'
    if (!emailOk(email)) next.email = 'Enter a valid email address'
    if (password.length < 8) next.password = 'Use at least 8 characters'
    if (!agree) next.agree = 'Please confirm to continue'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setServerError(null)
    try {
      await register(name, email, password)
      go()
    } catch (err) {
      setServerError(errorMessage(err))
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start making smarter buying decisions — free."
      footer={<>Already have an account? <Link to={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-medium text-navy-800 hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Alex Morgan" aria-invalid={!!errors.name} />
          {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="email" className="label">Work or personal email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} />
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" error={errors.password} />
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? (strength >= 3 ? 'bg-emerald-500' : 'bg-amber-400') : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="w-14 text-right text-xs text-slate-500">{strengthLabel}</span>
            </div>
          )}
          {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>}
        </div>
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-navy-900" />
            <span>I understand Siftwell is a preview: product data is fictional demo data, and my account details are stored on this Siftwell server.</span>
          </label>
          {errors.agree && <p className="mt-1.5 text-xs text-red-600">{errors.agree}</p>}
        </div>
        {serverError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{serverError}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create account
        </button>
      </form>
    </AuthShell>
  )
}
