import { useState } from 'react'
import { Info, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { cn } from '../lib/format'
import type { Criterion, RecommendationResponse } from '../types/api'

export const CRITERIA: { id: Criterion; label: string }[] = [
  { id: 'processor', label: 'Processor' },
  { id: 'ram', label: 'RAM' },
  { id: 'battery', label: 'Battery' },
  { id: 'storage', label: 'Storage' },
  { id: 'display', label: 'Display' },
  { id: 'value', label: 'Value for money' },
]

/** Same defaults as the backend engine (DEFAULT_WEIGHTS). */
export const DEFAULT_WEIGHTS: Record<Criterion, number> = { processor: 20, ram: 15, battery: 15, storage: 10, display: 15, value: 25 }

interface Props {
  data?: RecommendationResponse
  weights: Record<Criterion, number>
  onWeightsChange: (w: Record<Criterion, number>) => void
  adjustForUsage: boolean
  onAdjustChange: (v: boolean) => void
  sortedByMatch: boolean
}

export function ScoringPanel({ data, weights, onWeightsChange, adjustForUsage, onAdjustChange, sortedByMatch }: Props) {
  const [editing, setEditing] = useState(false)
  const effective = new Map(data?.weights.map((w) => [w.criterion, w]) ?? [])
  const isDefault = CRITERIA.every((c) => weights[c.id] === DEFAULT_WEIGHTS[c.id])
  const reasonsBy = (c: Criterion) => data?.adjustments.filter((a) => a.criterion === c) ?? []

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-soft" aria-label="How products are scored">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">How products are scored</h2>
          <p className="text-xs text-slate-500">
            {sortedByMatch ? 'Each product gets a score out of 100 from its listed specs, using these weights.' : 'Scores are still shown, but results are sorted by your chosen order.'}
          </p>
        </div>
        <button onClick={() => setEditing((e) => !e)} aria-expanded={editing} className="btn-secondary py-1.5 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" /> {editing ? 'Done' : 'Customise weights'}
        </button>
      </div>

      {/* Effective weights */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        {CRITERIA.map((c) => {
          const w = effective.get(c.id)
          const reasons = reasonsBy(c.id)
          return (
            <div key={c.id} title={reasons.map((r) => `×${r.factor} — ${r.reason}`).join('\n') || undefined}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-700">{c.label}</span>
                <span className="tabular-nums text-slate-900">{w ? `${Math.round(w.effective)}%` : '—'}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-navy-700 transition-all" style={{ width: `${Math.min(100, (w?.effective ?? 0) * 2.5)}%` }} />
              </div>
              {w && w.multiplier !== 1 && <p className="mt-0.5 text-[11px] text-navy-700">×{w.multiplier} for your needs</p>}
            </div>
          )
        })}
      </div>

      {editing && (
        <div className="animate-fade-in border-t border-slate-100 px-4 py-3">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {CRITERIA.map((c) => (
              <label key={c.id} className="block text-xs">
                <span className="flex justify-between font-medium text-slate-700">
                  {c.label} <span className="tabular-nums text-slate-500">{weights[c.id]}</span>
                </span>
                <input
                  type="range" min={0} max={50} step={5} value={weights[c.id]}
                  onChange={(e) => onWeightsChange({ ...weights, [c.id]: Number(e.target.value) })}
                  className="mt-1 w-full accent-navy-900" aria-label={`${c.label} importance`}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={adjustForUsage} onChange={(e) => onAdjustChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-navy-900" />
              Adjust weights for my uses and priorities
            </label>
            {!isDefault && (
              <button onClick={() => onWeightsChange(DEFAULT_WEIGHTS)} className="btn-ghost py-1 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Reset to defaults</button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Sliders set base importance. They’re converted to percentages that add up to 100%{adjustForUsage ? ', after adjusting for your uses and priorities' : ''}.</p>
        </div>
      )}

      {data && (data.adjustments.length > 0 || data.excluded.length > 0 || data.unchecked_requirements.length > 0 || data.warnings.length > 0) && (
        <details className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-slate-900">
            <Info className="h-3.5 w-3.5 text-slate-400" /> Details
            {data.excluded.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">{data.excluded.length} excluded by must-haves</span>}
          </summary>
          <div className="mt-2 space-y-3">
            {data.adjustments.length > 0 && (
              <div>
                <p className="font-semibold text-slate-700">Weight adjustments</p>
                <ul className="mt-1 space-y-0.5">{data.adjustments.map((a, i) => <li key={i}>{CRITERIA.find((c) => c.id === a.criterion)?.label} ×{a.factor} — {a.reason}</li>)}</ul>
              </div>
            )}
            {data.excluded.length > 0 && (
              <div>
                <p className="font-semibold text-slate-700">Excluded by must-have requirements</p>
                <ul className="mt-1 space-y-0.5">{data.excluded.map((e) => <li key={e.slug}><span className="font-medium">{e.name}</span> — {e.reasons.join('; ')}</li>)}</ul>
              </div>
            )}
            {data.unchecked_requirements.length > 0 && (
              <div>
                <p className="font-semibold text-slate-700">Guidelines that can’t be checked</p>
                <ul className="mt-1 space-y-0.5">{data.unchecked_requirements.map((u) => <li key={u.text}>{u.text} — {u.reason}</li>)}</ul>
              </div>
            )}
            {data.warnings.length > 0 && <ul className={cn('space-y-0.5 text-amber-800')}>{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          </div>
        </details>
      )}
      {data && <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-snug text-slate-400">{data.method}</p>}
    </section>
  )
}
