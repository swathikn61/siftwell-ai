/**
 * Frontend-only sample data.
 *
 * Products now come from the backend API. What remains here is user-specific
 * sample state that has no backend yet (saved comparisons, saved products and
 * the demo profile). It references backend demo products by slug.
 */

export const examplePrompts = [
  'Gaming laptop with dedicated GPU under ₹1.5 lakh',
  'Smartphone with OLED display under ₹50,000',
  'Laptop between ₹40k and ₹80k',
  'Phone with 5,000 mAh battery',
]

export interface SavedComparison {
  id: string
  title: string
  /** Backend product slugs */
  productSlugs: string[]
  createdAt: string
  note?: string
}

/** Sample saved comparisons (stored in the browser until accounts exist). */
export const demoSavedComparisons: SavedComparison[] = [
  { id: 'cmp-1', title: 'Laptops for coding', productSlugs: ['northwind-ab14p-26', 'kestrel-sa13-26', 'northwind-ab14-26'], createdAt: '2026-11-11T10:24:00Z', note: 'Leaning towards the Aurora for battery life.' },
  { id: 'cmp-2', title: 'Gaming laptops', productSlugs: ['ironpeak-fg15-26', 'halcyon-vs16-26'], createdAt: '2026-11-08T18:02:00Z' },
  { id: 'cmp-3', title: 'Mid-range phones', productSlugs: ['brightline-na5-26', 'tempo-p9-26', 'orbis-pm-26'], createdAt: '2026-11-02T09:15:00Z' },
  { id: 'cmp-4', title: 'Flagship phones', productSlugs: ['orbis-lxp-26', 'halcyon-ef-26'], createdAt: '2026-10-27T14:40:00Z', note: 'Is the foldable worth the extra?' },
]

export const demoSavedProductSlugs = ['orbis-lxp-26', 'northwind-ab14p-26', 'brightline-na5-26']

export const demoUser = {
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  plan: 'Pro (demo)',
  location: 'Bengaluru, India',
  currency: 'INR',
}
