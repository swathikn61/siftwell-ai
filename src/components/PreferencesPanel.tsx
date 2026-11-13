import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, Loader2, Plus, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { useBrands, useCategories } from '../hooks/useApi'
import { cn } from '../lib/format'
import type { HardwareSpec, PreferenceResponse, ShoppingPreferences } from '../types/api'
import { ErrorState, Skeleton } from './ui'

const specLabels: Record<HardwareSpec, string> = {
  processor: 'Processor',
  ram: 'RAM',
  storage: 'Storage',
  battery: 'Battery',
  display: 'Display',
  graphics: 'Graphics',
}

interface Filters {
  category?: string
  min?: number
  max?: number
  brands: string[]
}

interface Props {
  response?: PreferenceResponse
  loading: boolean
  error?: string
  onRetry: () => void
  onUseBasic: () => void
  /** Validate the edited preferences on the server and apply them. */
  onApply: (prefs: ShoppingPreferences) => Promise<{ error: string | null; warnings: string[] }>
  /** Filters currently applied to the results (kept in sync when the sidebar changes them) */
  current: Filters
}

/** Editable list of short phrases (use cases, priorities). */
function ChipList({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const value = text.trim()
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value])
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-1 text-sm text-slate-700">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-white pl-2.5 pr-1 focus-within:border-navy-400">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={placeholder} maxLength={60} className="w-28 bg-transparent py-1 text-sm placeholder:text-slate-400 focus:outline-none" aria-label={`Add to ${label.toLowerCase()}`} />
          <button type="button" onClick={add} disabled={!text.trim()} className="grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:text-navy-700 disabled:opacity-40" aria-label={`Add to ${label.toLowerCase()}`}>
            <Plus className="h-3 w-3" />
          </button>
        </span>
      </div>
    </div>
  )
}

export function PreferencesPanel({ response, loading, error, onRetry, onUseBasic, onApply, current }: Props) {
  const [draft, setDraft] = useState<ShoppingPreferences | null>(response?.preferences ?? null)
  const [edited, setEdited] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyWarnings, setApplyWarnings] = useState<string[]>([])
  const categories = useCategories()
  const brands = useBrands(draft?.category ?? undefined)

  // New extraction result -> start editing from it
  useEffect(() => {
    if (response) {
      setDraft(response.preferences)
      setEdited(false)
      setApplyError(null)
      setApplyWarnings([])
    }
  }, [response])

  // Keep category/budget/brands in step with filters changed from the sidebar
  const currentKey = JSON.stringify(current)
  useEffect(() => {
    setDraft((d) =>
      d && {
        ...d,
        category: (current.category as ShoppingPreferences['category']) ?? null,
        min_budget_inr: current.min ?? null,
        max_budget_inr: current.max ?? null,
        brands: current.brands,
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

  if (loading && !response) {
    return (
      <section className="card p-5" aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin text-navy-600" /> Understanding your request…
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-12 md:col-span-2" />
        </div>
      </section>
    )
  }
  if (error) {
    return (
      <div className="space-y-2">
        <ErrorState compact title="Couldn’t read your request" message={error} onRetry={onRetry} />
        <button onClick={onUseBasic} className="text-sm font-medium text-navy-800 hover:underline">Search without AI instead →</button>
      </div>
    )
  }
  if (!response || !draft) return null

  const update = (patch: Partial<ShoppingPreferences>) => {
    setDraft({ ...draft, ...patch })
    setEdited(true)
    setApplyError(null)
  }
  const budgetInvalid = draft.min_budget_inr != null && draft.max_budget_inr != null && draft.min_budget_inr > draft.max_budget_inr
  const toBudget = (v: string) => (v === '' ? null : Math.max(0, Math.round(Number(v))))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (budgetInvalid) return
    setApplying(true)
    const { error: err, warnings } = await onApply(draft)
    setApplying(false)
    setApplyError(err)
    setApplyWarnings(warnings)
    if (!err) setEdited(false)
  }

  const sourceBadge =
    response.source === 'ai' ? (
      <span
        title={
          response.diagnostics
            ? `Gemini: ${response.diagnostics.api_total_ms} ms (model ${response.diagnostics.model_wait_ms ?? '?'} ms, connection ${response.diagnostics.connect_ms ?? '?'} ms) · total ${response.diagnostics.extraction_total_ms} ms · ${response.diagnostics.output_tokens ?? '?'} output tokens`
            : undefined
        }
        className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-800 ring-1 ring-inset ring-navy-100"
      >
        <Sparkles className="h-3 w-3" /> AI · {response.model} · {(response.duration_ms / 1000).toFixed(1)}s
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
        Basic text matching
      </span>
    )

  const availableBrands = (brands.data ?? []).map((b) => b.brand).filter((b) => !draft.brands.includes(b))

  return (
    <form onSubmit={submit} className="card overflow-hidden" aria-label="Your preferences">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Your preferences</h2>
          {sourceBadge}
          {edited && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Edited</span>}
        </div>
        <p className="text-xs text-slate-400">Check and edit anything before searching</p>
      </div>

      {response.warnings.length > 0 && (
        <div className="flex gap-2.5 border-b border-amber-100 bg-amber-50/70 px-5 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-0.5">{response.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div>
          <label htmlFor="pref-category" className="label">Category</label>
          <select id="pref-category" className="input" value={draft.category ?? ''} onChange={(e) => update({ category: (e.target.value || null) as ShoppingPreferences['category'], brands: [] })}>
            <option value="">Any category</option>
            {categories.data?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <p className="label">Budget (₹)</p>
          <div className="flex items-center gap-2">
            <input type="number" min={0} step={1000} inputMode="numeric" className="input" placeholder="Min" aria-label="Minimum budget in rupees" value={draft.min_budget_inr ?? ''} onChange={(e) => update({ min_budget_inr: toBudget(e.target.value) })} />
            <span className="text-slate-300">–</span>
            <input type="number" min={0} step={1000} inputMode="numeric" className="input" placeholder="Max" aria-label="Maximum budget in rupees" value={draft.max_budget_inr ?? ''} onChange={(e) => update({ max_budget_inr: toBudget(e.target.value) })} />
          </div>
          {budgetInvalid && <p className="mt-1.5 text-xs text-rose-600">Minimum can’t be more than maximum.</p>}
        </div>

        <ChipList label="Uses" values={draft.use_cases} onChange={(v) => update({ use_cases: v })} placeholder="Add a use" />
        <ChipList label="Priorities" values={draft.priorities} onChange={(v) => update({ priorities: v })} placeholder="Add a priority" />

        <div className="md:col-span-2">
          <p className="label">Brands</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.brands.map((b) => (
              <span key={b} className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-navy-50 py-0.5 pl-2.5 pr-1 text-sm text-navy-900">
                {b}
                <button type="button" onClick={() => update({ brands: draft.brands.filter((x) => x !== b) })} className="grid h-5 w-5 place-items-center rounded-full text-navy-400 hover:bg-navy-100 hover:text-navy-800" aria-label={`Remove ${b}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {availableBrands.length > 0 && (
              <select value="" onChange={(e) => e.target.value && update({ brands: [...draft.brands, e.target.value] })} className="rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-500 focus:outline-none" aria-label="Add a brand">
                <option value="">{draft.brands.length ? '+ Add brand' : 'Any brand — add one'}</option>
                {availableBrands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>
        </div>

        {draft.hardware_preferences.length > 0 && (
          <div className="md:col-span-2">
            <p className="label">AI hardware suggestions</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {draft.hardware_preferences.map((hp) => (
                <li key={hp.spec} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                  <span className="w-20 shrink-0 font-medium text-slate-500">{specLabels[hp.spec]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-900">{hp.preference}</span>
                    {hp.reason && <span className="block text-xs text-slate-500">{hp.reason}</span>}
                  </span>
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-600" title="Exclude products that don’t meet this (or whose listing doesn’t show it)">
                    <input
                      type="checkbox"
                      checked={!!hp.mandatory}
                      onChange={(e) => update({ hardware_preferences: draft.hardware_preferences.map((x) => (x.spec === hp.spec ? { ...x, mandatory: e.target.checked } : x)) })}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-navy-900"
                    />
                    Must have
                  </label>
                  <button type="button" onClick={() => update({ hardware_preferences: draft.hardware_preferences.filter((x) => x.spec !== hp.spec) })} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${specLabels[hp.spec]} suggestion`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-slate-400">General guidelines suggested by AI — not verified requirements or specs of any product. Tick “Must have” to exclude products that don’t meet one; otherwise they’re shown as strengths or weaknesses.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
        <p className="text-xs text-slate-500">Category, budget, brands and must-haves filter results; uses and priorities adjust the scoring weights.</p>
        <div className="flex items-center gap-2">
          {edited && (
            <button type="button" onClick={() => { setDraft(response.preferences); setEdited(false); setApplyError(null) }} className="btn-ghost py-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
          <button type="submit" disabled={applying || budgetInvalid} className={cn('btn-primary py-2')}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search with these preferences
          </button>
        </div>
      </div>
      {applyError && <p className="border-t border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700" role="alert">{applyError}</p>}
      {!applyError && applyWarnings.length > 0 && (
        <ul className="border-t border-amber-100 bg-amber-50/70 px-5 py-2.5 text-sm text-amber-900">{applyWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
    </form>
  )
}
