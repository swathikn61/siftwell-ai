import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BadgeCheck, CheckCircle2, CircleDashed, FlaskConical, Laptop, Package, RefreshCw, Smartphone,
  type LucideIcon,
} from 'lucide-react'
import type { VerificationStatus } from '../types/api'
import { cn } from '../lib/format'
import { useApp } from '../context/AppContext'

/**
 * The Siftwell mark (from docs/brand/siftwell-mark-*.svg): three rounded strokes forming an
 * "S" that narrows like a sieve, ending in a gold dot. `variant="dark"` is for dark backgrounds.
 */
export function BrandMark({ variant = 'light', className }: { variant?: 'light' | 'dark'; className?: string }) {
  const id = `sw-gold-${useId().replace(/:/g, '')}`
  const [top, middle, bottom] = variant === 'dark' ? ['#585663', '#9C998F', '#F5F1E8'] : ['#CFCAC0', '#8C887F', '#14141C']
  return (
    <svg viewBox="23 24 74 74" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DFA2" />
          <stop offset=".5" stopColor="#D4AF5A" />
          <stop offset="1" stopColor="#9E7A2F" />
        </linearGradient>
      </defs>
      <g transform="translate(-4 2)" fill="none" strokeLinecap="round" strokeWidth="11">
        <path d="M94 34H46a12 12 0 0 0 0 24" stroke={top} />
        <path d="M46 58H74a12 12 0 0 1 0 24" stroke={middle} />
        <path d="M74 82H50" stroke={bottom} />
        <circle cx="36" cy="82" r="7" fill={`url(#${id})`} stroke="none" />
      </g>
    </svg>
  )
}

/** Mark + SIFTWELL wordmark (+ optional "CHOOSE WELL" tagline), linking home. `light` = for dark backgrounds. */
export function Logo({ to = '/', className, light = false, tagline = false }: { to?: string; className?: string; light?: boolean; tagline?: boolean }) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-2.5', className)} aria-label="Siftwell home">
      <BrandMark variant={light ? 'dark' : 'light'} className="h-8 w-8 shrink-0 transition-transform duration-300 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className={cn('font-brand text-[15px] font-medium tracking-[0.24em]', light ? 'text-[#F5F1E8]' : 'text-[#14141C]')}>SIFTWELL</span>
        {tagline && (
          <span className={cn('font-brand mt-1 text-[8.5px] font-semibold tracking-[0.42em]', light ? 'text-[#D4AF5A]' : 'text-[#A8842F]')}>CHOOSE WELL</span>
        )}
      </span>
    </Link>
  )
}

const categoryIcons: Record<string, LucideIcon> = {
  laptops: Laptop,
  smartphones: Smartphone,
}

export function categoryIcon(slug: string | undefined): LucideIcon {
  return (slug && categoryIcons[slug]) || Package
}

/** Product image, or a neutral category icon when there is no image (or it fails to load). */
export function ProductThumb({
  category, imageUrl, alt = '', size = 'md', className,
}: { category?: string; imageUrl?: string | null; alt?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [failed, setFailed] = useState(false)
  const Icon = categoryIcon(category)
  const dims = { sm: 'h-12 w-12 rounded-xl', md: 'h-full w-full rounded-xl', lg: 'h-full w-full rounded-2xl' }[size]
  const icon = { sm: 'h-5 w-5', md: 'h-10 w-10', lg: 'h-16 w-16' }[size]
  return (
    <div className={cn('grid shrink-0 place-items-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 ring-1 ring-inset ring-slate-200/70', dims, className)}>
      {imageUrl && !failed ? (
        <img src={imageUrl} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain p-2" />
      ) : (
        <Icon className={cn(icon, 'text-navy-800/70')} strokeWidth={1.4} aria-hidden="true" />
      )}
    </div>
  )
}

export function DemoBadge({ className, label = 'Demo data' }: { className?: string; label?: string }) {
  return (
    <span
      title="Fictional sample data for UI preview — not real-world information"
      className={cn('inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800', className)}
    >
      <FlaskConical className="h-3 w-3" />
      {label}
    </span>
  )
}

const verification: Record<VerificationStatus, { label: string; title: string; icon: LucideIcon; cls: string }> = {
  demo: {
    label: 'Demo data',
    title: 'Fictional sample product — specs and price are not real-world information',
    icon: FlaskConical,
    cls: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  verified: {
    label: 'Verified',
    title: 'Checked against the source on the last verified date',
    icon: BadgeCheck,
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  unverified: {
    label: 'Unverified',
    title: 'Not yet checked against a source',
    icon: CircleDashed,
    cls: 'border-slate-200 bg-slate-50 text-slate-600',
  },
}

export function VerificationBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const v = verification[status]
  return (
    <span title={v.title} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', v.cls, className)}>
      <v.icon className="h-3 w-3" />
      {v.label}
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

export function ErrorState({ title = 'Couldn’t load this', message, onRetry, compact = false }: { title?: string; message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={cn('flex rounded-2xl border border-rose-200 bg-rose-50/60', compact ? 'items-center gap-3 px-4 py-3' : 'flex-col items-center px-6 py-12 text-center')}>
      <div className={cn('grid shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600', compact ? 'h-8 w-8' : 'h-12 w-12 rounded-2xl')}>
        <AlertTriangle className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </div>
      <div className={cn(compact ? 'min-w-0 flex-1' : 'mt-4')}>
        <p className="text-sm font-semibold text-rose-900">{title}</p>
        <p className={cn('text-sm text-rose-700', !compact && 'mx-auto mt-1 max-w-md')}>{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className={cn('btn border border-rose-200 bg-white text-rose-700 hover:bg-rose-50', compact ? 'px-3 py-1.5 text-xs' : 'mt-5')}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} aria-hidden="true" />
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden p-3" aria-hidden="true">
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="space-y-2.5 px-1 pb-1 pt-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-4 h-9 w-full rounded-xl" />
      </div>
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
