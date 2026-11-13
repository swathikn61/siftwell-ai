import { Link } from 'react-router-dom'
import {
  Camera, Headphones, Home, Laptop, Monitor, Smartphone, Star, Tablet, Watch, FlaskConical, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryId } from '../data/demo'
import { cn } from '../lib/format'
import { useApp } from '../context/AppContext'

export function Logo({ to = '/', className, light = false }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-2.5', className)} aria-label="Siftwell home">
      <span className={cn('grid h-8 w-8 place-items-center rounded-lg transition-transform duration-300 group-hover:scale-105', light ? 'bg-white' : 'bg-navy-900')}>
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
          <path d="M8 10h16M11 16h10M14 22h4" stroke={light ? '#13235b' : '#fff'} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
      </span>
      <span className={cn('text-[17px] font-semibold tracking-tight', light ? 'text-white' : 'text-slate-900')}>Siftwell</span>
    </Link>
  )
}

export const categoryIcons: Record<CategoryId, LucideIcon> = {
  laptops: Laptop,
  smartphones: Smartphone,
  headphones: Headphones,
  smartwatches: Watch,
  cameras: Camera,
  monitors: Monitor,
  tablets: Tablet,
  home: Home,
}

/** Neutral product "image" placeholder — real imagery comes with the backend. */
export function ProductThumb({ category, size = 'md', className }: { category: CategoryId; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = categoryIcons[category]
  const dims = { sm: 'h-12 w-12 rounded-xl', md: 'h-full w-full rounded-xl', lg: 'h-full w-full rounded-2xl' }[size]
  const icon = { sm: 'h-5 w-5', md: 'h-10 w-10', lg: 'h-14 w-14' }[size]
  return (
    <div className={cn('grid shrink-0 place-items-center bg-gradient-to-b from-slate-50 to-slate-100 ring-1 ring-inset ring-slate-200/70', dims, className)}>
      <Icon className={cn(icon, 'text-navy-800/70')} strokeWidth={1.4} />
    </div>
  )
}

export function Rating({ value, reviews, className }: { value: number; reviews?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-slate-600', className)}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium text-slate-800">{value.toFixed(1)}</span>
      {reviews !== undefined && <span className="text-slate-400">({reviews.toLocaleString()})</span>}
    </span>
  )
}

export function DemoBadge({ className, label = 'Demo data' }: { className?: string; label?: string }) {
  return (
    <span
      title="This is sample data for UI preview only"
      className={cn('inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800', className)}
    >
      <FlaskConical className="h-3 w-3" />
      {label}
    </span>
  )
}

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center rounded-md bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-800 ring-1 ring-inset ring-navy-100">
      {score}% match
    </span>
  )
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Toaster() {
  const { toasts } = useApp()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-fade-up inline-flex items-center gap-2 rounded-xl bg-navy-950 px-4 py-2.5 text-sm text-white shadow-lift">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          {t.message}
        </div>
      ))}
    </div>
  )
}
