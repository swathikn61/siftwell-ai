import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUp, Info, Loader2, MessageCircleQuestion, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { api, ApiError, errorMessage } from '../lib/api'
import { cn } from '../lib/format'
import type { AssistantContext, AssistantReply, ChatTurn } from '../types/api'
import { productPath } from './ProductCard'

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  reply?: AssistantReply
  error?: string
}

const DEFAULT_SUGGESTIONS = [
  'Why is this product ranked first?',
  'Which one has the best battery?',
  'Is the most expensive option worth buying?',
  'Which is better for programming?',
  'What are the disadvantages of the top product?',
]

function loadMessages(key: string): Message[] {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Message[]) : []
  } catch {
    return []
  }
}

/** Render the assistant's plain text: paragraphs, and lines starting with "- " as bullets. */
function AnswerText({ text }: { text: string }) {
  const blocks: { bullets: boolean; lines: string[] }[] = []
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const bullet = /^[-•*]\s+/.test(line)
    const content = line.replace(/^[-•*]\s+/, '')
    const last = blocks[blocks.length - 1]
    if (last && last.bullets === bullet && bullet) last.lines.push(content)
    else blocks.push({ bullets: bullet, lines: [content] })
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) =>
        b.bullets ? (
          <ul key={i} className="list-disc space-y-1 pl-4">{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
        ) : (
          <p key={i}>{b.lines.join(' ')}</p>
        ),
      )}
    </div>
  )
}

interface Props {
  context: AssistantContext | null
  /** sessionStorage key: one conversation per search or comparison */
  storageKey: string
  title?: string
  suggestions?: string[]
}

export function DecisionAssistant({ context, storageKey, title = 'Ask about these results', suggestions = DEFAULT_SUGGESTIONS }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(storageKey))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [startedWith, setStartedWith] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const contextKey = JSON.stringify(context)

  // New search/comparison -> load its own conversation
  useEffect(() => {
    setMessages(loadMessages(storageKey))
    setStartedWith(null)
  }, [storageKey])

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)))
    } catch {
      /* storage unavailable */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, storageKey])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!context || context.product_slugs.length === 0) return null

  const send = async (question: string, retry?: { errorId: number; questionId: number }) => {
    const text = question.trim()
    if (!text || pending) return
    // History = earlier successful turns only (errors left out; when retrying, stop before the retried question)
    const earlier = messages.filter((m) => !m.error && (!retry || m.id < retry.questionId))
    const history: ChatTurn[] = earlier.slice(-10).map((m) => ({ role: m.role, content: m.content }))
    if (startedWith === null) setStartedWith(contextKey)

    setMessages((prev) =>
      retry ? prev.filter((m) => m.id !== retry.errorId) : [...prev, { id: Date.now(), role: 'user', content: text }],
    )
    setInput('')
    setPending(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const reply = await api.assistantChat(text, context, history, controller.signal)
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply.answer, reply }])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      let message = errorMessage(err)
      if (err instanceof ApiError && err.status === 429) message = `${message} You can retry shortly.`
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', content: '', error: message }])
    } finally {
      setPending(false)
    }
  }

  const retry = (errorId: number) => {
    const idx = messages.findIndex((m) => m.id === errorId)
    const question = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user')
    if (question) void send(question.content, { errorId, questionId: question.id })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }
  const clear = () => {
    abortRef.current?.abort()
    setPending(false)
    setMessages([])
    setStartedWith(null)
  }

  const contextChanged = startedWith !== null && startedWith !== contextKey && messages.length > 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn('fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-3 text-sm font-medium text-white shadow-lift transition hover:bg-navy-800 sm:right-6', open && 'hidden')}
        aria-haspopup="dialog"
      >
        <MessageCircleQuestion className="h-4 w-4" /> Ask Siftwell AI
        {messages.length > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs">{messages.filter((m) => m.role === 'user').length}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
          <div className="animate-fade-in absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="animate-fade-up relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-lift">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-navy-900 text-white"><Sparkles className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-500">Uses Siftwell’s data for {context.product_slugs.length} product{context.product_slugs.length === 1 ? '' : 's'}</p>
              </div>
              {messages.length > 0 && (
                <button onClick={clear} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear conversation" title="Clear conversation">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close assistant">
                <X className="h-4 w-4" />
              </button>
            </div>

            {contextChanged && (
              <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> The results changed since this conversation started. New answers use the current results.
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
              {messages.length === 0 && (
                <div>
                  <p className="text-sm text-slate-600">Ask anything about these products — why one ranks higher, trade-offs, or what’s missing. Answers only use Siftwell’s listed specs, prices and scores.</p>
                  <div className="mt-4 flex flex-col items-start gap-2">
                    {suggestions.map((s) => (
                      <button key={s} onClick={() => void send(s)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-navy-200 hover:bg-navy-50 hover:text-navy-900">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-navy-900 px-3.5 py-2 text-sm text-white">{m.content}</p>
                  </div>
                ) : m.error ? (
                  <div key={m.id} role="alert" className="max-w-[90%] rounded-2xl rounded-bl-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
                    <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {m.error}</p>
                    <button onClick={() => retry(m.id)} disabled={pending} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline disabled:opacity-50">
                      <RefreshCw className="h-3 w-3" /> Try again
                    </button>
                  </div>
                ) : (
                  <div key={m.id} className="max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800">
                    <AnswerText text={m.content} />
                    {m.reply && m.reply.unavailable.length > 0 && (
                      <p className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600">
                        <span className="font-medium">Not in Siftwell’s data:</span> {m.reply.unavailable.join(', ')}
                      </p>
                    )}
                    {m.reply && m.reply.warnings.length > 0 && (
                      <ul className="mt-2 space-y-0.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{m.reply.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
                    )}
                    {m.reply && m.reply.cited_products.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.reply.cited_products.map((p) => (
                          <Link key={p.slug} to={productPath(p)} onClick={() => setOpen(false)} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-navy-800 hover:border-navy-200">
                            {p.name} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}

              {pending && (
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={submit} className="border-t border-slate-100 p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 pl-3 focus-within:border-navy-300 focus-within:ring-4 focus-within:ring-navy-100/70">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  maxLength={500}
                  placeholder="Ask a follow-up question…"
                  aria-label="Your question"
                  className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
                />
                <button type="submit" disabled={!input.trim() || pending} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-900 text-white transition hover:bg-navy-800 disabled:opacity-40" aria-label="Send">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 px-1 text-[11px] text-slate-400">Answers use Siftwell’s listed specs, prices and rule-based scores. AI can still make mistakes — check the product page.</p>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}
