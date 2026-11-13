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
