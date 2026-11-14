import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/format'
import { Logo } from './ui'

const links = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#categories', label: 'Categories' },
]

export function Navbar() {
  const { user } = useApp()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const onLanding = pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cn('sticky top-0 z-40 transition-all duration-300', scrolled ? 'border-b border-slate-200/80 bg-white/85 backdrop-blur' : 'border-b border-transparent bg-white')}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        {onLanding && (
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/app" className="btn-primary">Go to dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Log in</Link>
              <Link to="/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Toggle menu" aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="animate-fade-in border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
          {onLanding &&
            links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                {l.label}
              </a>
            ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {user ? (
              <Link to="/app" className="btn-primary col-span-2">Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">Log in</Link>
                <Link to="/signup" className="btn-primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

export function Footer() {
  const cols = [
    { title: 'Product', items: [['How it works', '/#how-it-works'], ['Features', '/#features'], ['Categories', '/#categories']] },
    { title: 'Account', items: [['Log in', '/login'], ['Sign up', '/signup'], ['Dashboard', '/app']] },
    { title: 'Company', items: [['About', '/#'], ['Privacy', '/#'], ['Terms', '/#']] },
  ]
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo tagline />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
            AI-powered product comparison that helps you choose with confidence — based on your budget, needs and preferences.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.items.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith('/#') ? (
                    <a href={href} className="text-sm text-slate-500 transition hover:text-slate-900">{label}</a>
                  ) : (
                    <Link to={href} className="text-sm text-slate-500 transition hover:text-slate-900">{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-slate-400 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Siftwell. All rights reserved.</p>
          <p>Product data shown in this preview is fictional demo data.</p>
        </div>
      </div>
    </footer>
  )
}
