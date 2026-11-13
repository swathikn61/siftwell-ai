import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2, Quote } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { demoUser } from '../data/demo'
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
          Preview build — authentication is simulated and no data leaves your browser.
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_20%,rgb(52_74_146/0.45),transparent)]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo light />
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function useFinishAuth() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const target = redirect && redirect.startsWith('/app') ? redirect : '/app'
  return { redirect, finish: (email: string, name?: string) => { login(email, name); navigate(target, { replace: true }) } }
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
  const { finish, redirect } = useFinishAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!emailOk(email)) next.email = 'Enter a valid email address'
    if (password.length < 6) next.password = 'Password must be at least 6 characters'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    window.setTimeout(() => finish(email), 600)
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={redirect ? 'Log in to continue to your search.' : 'Log in to your Siftwell account.'}
      footer={<>Don’t have an account? <Link to={`/signup${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-medium text-navy-800 hover:underline">Sign up</Link></>}
    >
      <button onClick={() => finish(demoUser.email)} className="btn-secondary w-full">
        <GoogleIcon /> Continue with Google
      </button>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" /> or <div className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} />
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">Password</label>
            <button type="button" className="mb-1.5 text-xs font-medium text-navy-700 hover:underline" onClick={() => alert('Password reset will be available once the backend is connected.')}>
              Forgot password?
            </button>
          </div>
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
          {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 accent-navy-900" /> Remember me
        </label>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Log in
        </button>
      </form>
      <button onClick={() => finish(demoUser.email)} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-600 transition hover:border-navy-300 hover:bg-navy-50/50 hover:text-navy-900">
        Explore with the demo account
      </button>
    </AuthShell>
  )
}

export function Signup() {
  const { finish, redirect } = useFinishAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const strength = [password.length >= 8, /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
  const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][strength]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Enter your full name'
    if (!emailOk(email)) next.email = 'Enter a valid email address'
    if (password.length < 8) next.password = 'Use at least 8 characters'
    if (!agree) next.agree = 'Please accept the terms to continue'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    window.setTimeout(() => finish(email, name), 700)
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start making smarter buying decisions — free."
      footer={<>Already have an account? <Link to={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-medium text-navy-800 hover:underline">Log in</Link></>}
    >
      <button onClick={() => finish(demoUser.email)} className="btn-secondary w-full">
        <GoogleIcon /> Sign up with Google
      </button>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" /> or <div className="h-px flex-1 bg-slate-200" />
      </div>
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
            <span>I agree to the <a href="#" className="font-medium text-navy-800 hover:underline">Terms</a> and <a href="#" className="font-medium text-navy-800 hover:underline">Privacy Policy</a>.</span>
          </label>
          {errors.agree && <p className="mt-1.5 text-xs text-red-600">{errors.agree}</p>}
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create account
        </button>
      </form>
    </AuthShell>
  )
}
