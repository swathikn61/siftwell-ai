import { useState } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '../lib/format'
import type { ScoredProduct } from '../types/api'

/** Colour tier for a 0–100 score. */
export function scoreTone(score: number) {
  if (score >= 70) return { ring: 'ring-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800', bar: 'bg-emerald-500' }
  if (score >= 45) return { ring: 'ring-navy-100', bg: 'bg-navy-50', text: 'text-navy-900', bar: 'bg-navy-600' }
  return { ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-900', bar: 'bg-amber-500' }
}

export function ScoreBadge({ match }: { match: ScoredProduct }) {
  const tone = scoreTone(match.score)
  return (
    <div className={cn('flex items-baseline gap-1 rounded-xl px-2.5 py-1 ring-1 ring-inset', tone.bg, tone.ring)} title={match.summary}>
      <span className={cn('text-lg font-semibold tabular-nums', tone.text)}>{Math.round(match.score)}</span>
      <span className="text-[11px] text-slate-500">/100</span>
    </div>
  )
}

/** Strengths, weaknesses and an expandable per-criterion breakdown for one scored product. */
export function MatchDetails({ match }: { match: ScoredProduct }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">#{match.rank} match</p>
        {match.coverage < 100 && <span className="text-[11px] text-slate-400" title="Some specs aren’t listed, so their weight was shared among the others">Scored on {match.coverage}% of weights</span>}
      </div>

      {match.strengths.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {match.strengths.slice(0, 2).map((s) => (
            <li key={s} className="flex items-start gap-1.5 text-xs leading-snug text-emerald-800">
              <Plus className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} /> {s}
            </li>
          ))}
        </ul>
      )}
      {match.weaknesses.length > 0 && (
        <ul className="mt-1 space-y-1">
          {match.weaknesses.slice(0, 2).map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs leading-snug text-rose-800">
              <Minus className="mt-px h-3.5 w-3.5 shrink-0 text-rose-500" strokeWidth={2.5} /> {w}
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-navy-800 hover:underline">
        {open ? 'Hide' : 'Show'} score breakdown <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade-in mt-2 space-y-2.5 rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-600">{match.summary}</p>
          {match.breakdown.map((b) => (
            <div key={b.criterion}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700">{b.label} <span className="font-normal text-slate-400">· {b.weight}%</span></span>
                <span className={cn('tabular-nums', b.score === null ? 'text-slate-400' : 'font-semibold text-slate-900')}>
                  {b.score === null ? 'not scored' : `${Math.round(b.score)} → +${b.contribution}`}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                {b.score !== null && <div className={cn('h-1.5 rounded-full', scoreTone(b.score).bar)} style={{ width: `${b.score}%` }} />}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{b.detail}</p>
            </div>
          ))}
          {match.requirements.length > 0 && (
            <div className="border-t border-slate-200 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hardware guidelines</p>
              <ul className="mt-1 space-y-0.5">
                {match.requirements.map((r) => (
                  <li key={r.text} className="text-[11px] text-slate-600">
                    {r.met === true ? '✓' : r.met === false ? '✗' : '?'} {r.text}{r.mandatory && ' (must have)'} — {r.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
