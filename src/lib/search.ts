import { categories, products, type CategoryId, type Product } from '../data/demo'

/**
 * Client-side stand-in for the AI search. It parses a natural-language prompt
 * for a budget, a category and need keywords, then ranks the demo catalogue.
 * The real ranking will come from the backend later.
 */
export interface ParsedQuery {
  budget?: number
  category?: CategoryId
  keywords: string[]
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'and', 'or', 'under', 'below', 'less', 'than', 'best', 'good', 'great',
  'top', 'my', 'me', 'i', 'need', 'want', 'looking', 'to', 'of', 'in', 'on', 'that', 'is', 'a', 'budget',
  'around', 'about', 'max', 'maximum', 'up', 'cheap', 'home', 'long',
])

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.toLowerCase()
  let budget: number | undefined
  const money = q.match(/(?:under|below|less than|up to|max(?:imum)?|around|about|within)?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?/)
  if (money && (q.includes('$') || /under|below|less than|up to|max|budget|within/.test(q))) {
    const n = parseFloat(money[1].replace(/,/g, ''))
    budget = money[2] ? n * 1000 : n
    if (budget < 20) budget = undefined
  }

  let category: CategoryId | undefined
  let bestLen = 0
  for (const c of categories) {
    for (const k of c.keywords) {
      if (q.includes(k) && k.length > bestLen) {
        category = c.id
        bestLen = k.length
      }
    }
  }

  const keywords = q
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+k?$/.test(w))

  return { budget, category, keywords }
}

export interface RankedProduct {
  product: Product
  relevance: number
  reasons: string[]
}

export function rankProducts(parsed: ParsedQuery): RankedProduct[] {
  const pool = parsed.category ? products.filter((p) => p.category === parsed.category) : products
  return pool
    .map((product) => {
      const haystack = [product.name, product.brand, product.tagline, ...product.tags, ...product.pros]
        .join(' ')
        .toLowerCase()
      const reasons: string[] = []
      let relevance = product.score
      const hits = parsed.keywords.filter((k) => haystack.includes(k))
      relevance += hits.length * 6
      if (hits.length) reasons.push(`Matches “${hits.slice(0, 2).join('”, “')}”`)
      if (parsed.budget !== undefined) {
        reasons.push(`Within your $${parsed.budget.toLocaleString()} budget`)
      }
      if (product.rating >= 4.7) reasons.push(`Highly rated (${product.rating}★)`)
      if (!reasons.length) reasons.push(product.tagline)
      return { product, relevance, reasons }
    })
    .filter((r) => parsed.budget === undefined || r.product.price <= parsed.budget)
    .sort((a, b) => b.relevance - a.relevance)
}

export function summarise(parsed: ParsedQuery, results: RankedProduct[]): string {
  if (!results.length) return 'No demo products match that prompt yet. Try widening your budget or picking a different category.'
  const parts: string[] = []
  const cat = parsed.category ? categories.find((c) => c.id === parsed.category)!.name.toLowerCase() : 'products'
  parts.push(`I found ${results.length} ${cat}`)
  if (parsed.budget) parts.push(`around a $${parsed.budget.toLocaleString()} budget`)
  const top = results[0].product
  return `${parts.join(' ')}. ${top.name} is the strongest overall match — ${top.tagline.toLowerCase()}. Add two or more to compare them side by side.`
}
