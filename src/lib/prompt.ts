/**
 * Turn a natural-language prompt into backend filters.
 *
 *   "gaming laptop under ₹1.2 lakh with dedicated gpu"
 *     → { category: 'laptops', maxPrice: 120000, keywords: ['gaming', 'dedicated', 'gpu'] }
 *
 * This is simple rule-based parsing, not AI. AI-powered understanding will be
 * added on the backend later.
 */

export interface ParsedPrompt {
  category?: string
  minPrice?: number
  maxPrice?: number
  keywords: string[]
}

const CATEGORY_WORDS: Record<string, string[]> = {
  laptops: ['laptop', 'laptops', 'notebook', 'notebooks', 'ultrabook', 'ultrabooks'],
  smartphones: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile', 'mobiles', 'handset'],
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'and', 'or', 'best', 'good', 'great', 'top', 'my', 'me', 'i', 'need', 'want',
  'looking', 'to', 'of', 'in', 'on', 'that', 'is', 'am', 'are', 'it', 'which', 'what', 'some', 'something', 'any',
  'buy', 'find', 'show', 'get', 'recommend', 'suggest', 'please', 'new', 'cheap', 'affordable', 'budget', 'price',
  'priced', 'cost', 'costing', 'rs', 'inr', 'rupees', 'around', 'about', 'having', 'has', 'have',
  // Spec labels: "16 GB RAM" should search for "16 GB", since spec values don't contain the label itself
  'ram', 'memory', 'storage', 'battery', 'display', 'screen', 'processor', 'cpu', 'chip', 'graphics', 'specs',
])

const AMOUNT = String.raw`(?:₹|rs\.?|inr|\$)?\s*(\d+(?:[.,]\d+)*)\s*(k|thousand|l|lakh|lakhs|lac|lacs)?\b`

function toRupees(num: string, unit?: string): number {
  const n = parseFloat(num.replace(/,/g, ''))
  if (!unit) return n
  const u = unit.toLowerCase()
  if (u === 'k' || u === 'thousand') return n * 1_000
  return n * 100_000 // lakh
}

export function parsePrompt(prompt: string): ParsedPrompt {
  let text = ` ${prompt.toLowerCase()} `
  const result: ParsedPrompt = { keywords: [] }

  /** Apply a pattern; the matched words are removed only if `apply` accepts them. */
  const take = (re: RegExp, apply: (m: RegExpMatchArray) => boolean) => {
    const m = text.match(re)
    if (m && apply(m)) text = text.replace(m[0], ' ')
  }

  // "between 40k and 60k", "40k - 60k", "40k to 60k"
  take(new RegExp(String.raw`(?:between\s+)?${AMOUNT}\s*(?:-|to|and)\s*${AMOUNT}`), (m) => {
    const a = toRupees(m[1], m[2] ?? m[4])
    const b = toRupees(m[3], m[4])
    if (a < 1000 || b < 1000) return false // e.g. "8 GB and 16 GB" is not a price range
    result.minPrice = Math.min(a, b)
    result.maxPrice = Math.max(a, b)
    return true
  })
  // "under 80000", "below ₹1 lakh", "up to 50k", "within 30k"
  take(new RegExp(String.raw`(?:under|below|less than|upto|up to|within|max(?:imum)?|budget(?: of)?|not more than)\s+${AMOUNT}`), (m) => {
    result.maxPrice = toRupees(m[1], m[2])
    return true
  })
  // "above 50k", "over ₹1 lakh", "more than 40000"
  take(new RegExp(String.raw`(?:above|over|more than|min(?:imum)?|at least|starting)\s+${AMOUNT}`), (m) => {
    result.minPrice = toRupees(m[1], m[2])
    return true
  })

  for (const [slug, words] of Object.entries(CATEGORY_WORDS)) {
    const re = new RegExp(String.raw`\b(${words.join('|')})\b`, 'g')
    if (re.test(text)) {
      result.category ??= slug
      text = text.replace(re, ' ')
    }
  }

  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP_WORDS.has(w))
  result.keywords = [...new Set(words)]

  return result
}

/**
 * Search page URL for a natural-language request. `ai=1` tells the search page
 * to ask the backend AI to extract preferences before searching.
 */
export function searchUrl(prompt: string): string {
  return `/app/search?${new URLSearchParams({ q: prompt.trim(), ai: '1' }).toString()}`
}

/** Search page URL using simple rule-based parsing only (no AI). */
export function basicSearchUrl(prompt: string): string {
  const parsed = parsePrompt(prompt)
  const params = new URLSearchParams({ q: prompt.trim() })
  if (parsed.category) params.set('category', parsed.category)
  if (parsed.minPrice) params.set('min', String(Math.round(parsed.minPrice)))
  if (parsed.maxPrice) params.set('max', String(Math.round(parsed.maxPrice)))
  return `/app/search?${params.toString()}`
}
