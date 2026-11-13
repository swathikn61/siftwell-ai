import { useState, type FormEvent } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '../lib/format'

interface Props {
  initial?: string
  onSearch: (query: string) => void
  size?: 'md' | 'lg'
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

export function SearchBox({ initial = '', onSearch, size = 'lg', placeholder, autoFocus, className }: Props) {
  const [value, setValue] = useState(initial)
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setValue(initial)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    if (q) onSearch(q)
  }

  const lg = size === 'lg'
  return (
    <form
      onSubmit={submit}
      role="search"
      className={cn(
        'group flex items-center gap-2 border border-slate-200 bg-white shadow-card transition-all duration-200 focus-within:border-navy-300 focus-within:shadow-lift focus-within:ring-4 focus-within:ring-navy-100/70',
        lg ? 'rounded-2xl p-2 pl-4 sm:pl-5' : 'rounded-xl p-1.5 pl-3.5',
        className,
      )}
    >
      <Sparkles className={cn('shrink-0 text-navy-500', lg ? 'h-5 w-5' : 'h-4 w-4')} />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        aria-label="Describe what you are looking for"
        placeholder={placeholder ?? 'Describe what you need — e.g. “laptop under ₹80,000 with OLED display”'}
        className={cn('min-w-0 flex-1 bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none', lg ? 'py-2.5 text-base' : 'py-1.5 text-sm')}
      />
      <button type="submit" disabled={!value.trim()} className={cn('btn-primary shrink-0', lg ? 'h-11 px-4 sm:px-5' : 'h-9 px-3')}>
        <span className="hidden sm:inline">Search</span>
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  )
}
