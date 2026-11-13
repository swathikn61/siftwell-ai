/** Types that mirror the FastAPI backend responses (see backend/app/schemas). */

export type VerificationStatus = 'demo' | 'verified' | 'unverified'
export type SortOption = 'price_asc' | 'price_desc' | 'newest' | 'name'

export interface CategoryRef {
  slug: string
  name: string
}

export interface Category extends CategoryRef {
  description: string
  product_count: number
}

export interface Specifications {
  processor: string | null
  ram: string | null
  storage: string | null
  battery: string | null
  display: string | null
  graphics: string | null
}

export interface Product {
  id: number
  slug: string
  name: string
  brand: string
  model: string
  category: CategoryRef
  /** Decimal serialised as a string by the API, e.g. "124990.00" */
  price_inr: string
  image_url: string | null
  specifications: Specifications | null
  source_url: string | null
  last_verified_date: string | null
  is_demo: boolean
  verification_status: VerificationStatus
  created_at: string
  updated_at: string
}

export interface ProductPage {
  items: Product[]
  total: number
  limit: number
  offset: number
}

export interface BrandCount {
  brand: string
  product_count: number
}

export interface Health {
  status: 'ok' | 'degraded'
  database: 'connected' | 'unavailable'
  version: string
}

export interface ProductQuery {
  q?: string
  category?: string
  brand?: string[]
  min_price?: number
  max_price?: number
  sort?: SortOption
  include_demo?: boolean
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Comparison (GET /api/compare)
// ---------------------------------------------------------------------------
export type SpecKey = 'price' | 'processor' | 'ram' | 'storage' | 'battery' | 'display' | 'graphics'

export interface SpecComparison {
  key: SpecKey
  label: string
  values: { slug: string; display: string | null }[]
  /** Slugs of the best product(s); empty when the data doesn't support a winner */
  best: string[]
  reason: string | null
  not_compared: string | null
}

export interface ProductAnalysis {
  slug: string
  advantages: string[]
  disadvantages: string[]
  specs_led: string[]
  missing_specs: string[]
}

export interface ComparisonSummary {
  headline: string
  points: string[]
  notes: string[]
  lowest_price: string | null
  most_specs_led: string | null
  compared_specs: number
}

export interface Comparison {
  products: Product[]
  missing: string[]
  specs: SpecComparison[]
  analysis: ProductAnalysis[]
  summary: ComparisonSummary
  method: string
}

// ---------------------------------------------------------------------------
// AI preference extraction (POST /api/ai/preferences)
// ---------------------------------------------------------------------------
export type HardwareSpec = 'processor' | 'ram' | 'storage' | 'battery' | 'display' | 'graphics'

export interface HardwarePreference {
  spec: HardwareSpec
  preference: string
  reason: string
  /** Set by the user: products that don't meet it are excluded */
  mandatory?: boolean
}

export interface ShoppingPreferences {
  category: 'laptops' | 'smartphones' | null
  min_budget_inr: number | null
  max_budget_inr: number | null
  use_cases: string[]
  priorities: string[]
  hardware_preferences: HardwarePreference[]
  brands: string[]
}

export interface PreferenceResponse {
  preferences: ShoppingPreferences
  search: { category: string | null; min_price: number | null; max_price: number | null; brand: string[] }
  /** ai = extracted by Gemini · rules = fallback parser · user = edited by the user */
  source: 'ai' | 'rules' | 'user'
  model: string | null
  duration_ms: number
  warnings: string[]
  diagnostics: AIDiagnostics | null
}

export interface AIDiagnostics {
  attempts: number
  connect_ms: number | null
  model_wait_ms: number | null
  server_ms: number | null
  api_total_ms: number
  extraction_total_ms: number
  prompt_tokens: number | null
  output_tokens: number | null
  thought_tokens: number | null
  thinking_level: string | null
}

// ---------------------------------------------------------------------------
// Recommendation engine (POST /api/recommendations) — deterministic scoring
// ---------------------------------------------------------------------------
export type Criterion = 'processor' | 'ram' | 'battery' | 'storage' | 'display' | 'value'
export type RecommendationSort = 'match' | 'price_asc' | 'price_desc' | 'name'

export interface RecommendationRequest {
  preferences: ShoppingPreferences
  weights: Record<Criterion, number> | null
  adjust_for_usage: boolean
  sort: RecommendationSort
  limit: number
  offset: number
}

export interface CriterionScore {
  criterion: Criterion
  label: string
  /** 0–100, or null when the spec isn't listed or can't be compared */
  score: number | null
  weight: number
  contribution: number | null
  value: string | null
  detail: string
}

export interface RequirementResult {
  text: string
  spec: string
  mandatory: boolean
  met: boolean | null
  detail: string
}

export interface ScoredProduct {
  rank: number
  product: Product
  score: number
  coverage: number
  breakdown: CriterionScore[]
  strengths: string[]
  weaknesses: string[]
  requirements: RequirementResult[]
  summary: string
}

export interface WeightSummary {
  criterion: Criterion
  label: string
  base: number
  multiplier: number
  effective: number
}

export interface RecommendationResponse {
  preferences: ShoppingPreferences
  items: ScoredProduct[]
  total: number
  limit: number
  offset: number
  sort: RecommendationSort
  weights: WeightSummary[]
  adjustments: { criterion: Criterion; factor: number; reason: string }[]
  adjust_for_usage: boolean
  excluded: { slug: string; name: string; price_inr: number; reasons: string[] }[]
  unchecked_requirements: { text: string; reason: string }[]
  scales: { category: string; criterion: string; scale: string }[]
  warnings: string[]
  method: string
}
