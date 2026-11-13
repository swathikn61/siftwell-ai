/**
 * DEMO DATA — every product, brand, price, rating and review count in this file
 * is fictional sample data used for UI previews only. It does not describe real
 * products and will be replaced by the backend later.
 */

export type CategoryId =
  | 'laptops'
  | 'smartphones'
  | 'headphones'
  | 'smartwatches'
  | 'cameras'
  | 'monitors'
  | 'tablets'
  | 'home'

export interface Category {
  id: CategoryId
  name: string
  description: string
  keywords: string[]
}

export interface Product {
  id: string
  name: string
  brand: string
  category: CategoryId
  price: number
  rating: number
  reviews: number
  /** 0–100 Siftwell match score (demo) */
  score: number
  tagline: string
  pros: string[]
  cons: string[]
  specs: Record<string, string>
  tags: string[]
}

export const categories: Category[] = [
  { id: 'laptops', name: 'Laptops', description: 'Ultrabooks, workstations and everyday notebooks', keywords: ['laptop', 'notebook', 'macbook', 'ultrabook', 'coding', 'programming', 'student'] },
  { id: 'smartphones', name: 'Smartphones', description: 'Flagships, mid-range and compact phones', keywords: ['phone', 'smartphone', 'mobile', 'android', 'iphone'] },
  { id: 'headphones', name: 'Headphones', description: 'Noise cancelling, earbuds and studio cans', keywords: ['headphone', 'headphones', 'earbuds', 'earphones', 'noise', 'anc', 'audio'] },
  { id: 'smartwatches', name: 'Smartwatches', description: 'Fitness trackers and connected watches', keywords: ['watch', 'smartwatch', 'fitness', 'tracker', 'running'] },
  { id: 'cameras', name: 'Cameras', description: 'Mirrorless, compact and vlogging cameras', keywords: ['camera', 'mirrorless', 'vlog', 'vlogging', 'photography', 'video'] },
  { id: 'monitors', name: 'Monitors', description: '4K, ultrawide and high-refresh displays', keywords: ['monitor', 'display', 'screen', '4k', 'ultrawide', 'gaming monitor'] },
  { id: 'tablets', name: 'Tablets', description: 'Tablets for drawing, notes and media', keywords: ['tablet', 'ipad', 'drawing', 'notes', 'reading'] },
  { id: 'home', name: 'Smart Home', description: 'Vacuums, coffee machines and air care', keywords: ['vacuum', 'robot', 'coffee', 'espresso', 'air purifier', 'home', 'kitchen'] },
]

export const products: Product[] = [
  // Laptops
  {
    id: 'lp-aurora-14', name: 'Aurora Book Pro 14', brand: 'Northwind', category: 'laptops', price: 1299, rating: 4.7, reviews: 2184, score: 94,
    tagline: 'Balanced performance with an all-day battery',
    pros: ['18-hour battery life', 'Excellent 2.8K OLED display', 'Quiet under load'],
    cons: ['Only two USB-C ports', 'Soldered RAM'],
    specs: { Processor: '12-core M-class', Memory: '16 GB', Storage: '512 GB SSD', Display: '14" 2.8K OLED', Battery: '18 hours', Weight: '1.35 kg' },
    tags: ['coding', 'student', 'portable', 'battery'],
  },
  {
    id: 'lp-vertex-16', name: 'Vertex Studio 16', brand: 'Halcyon', category: 'laptops', price: 1849, rating: 4.6, reviews: 963, score: 89,
    tagline: 'Creator workstation with a dedicated GPU',
    pros: ['RTX-class graphics', 'Colour-accurate mini-LED', 'Great keyboard'],
    cons: ['Heavy at 2.1 kg', 'Loud fans when rendering'],
    specs: { Processor: '16-core H-series', Memory: '32 GB', Storage: '1 TB SSD', Display: '16" 3.2K mini-LED', Battery: '9 hours', Weight: '2.10 kg' },
    tags: ['video editing', 'gaming', 'creative'],
  },
  {
    id: 'lp-slate-13', name: 'Slate Air 13', brand: 'Kestrel', category: 'laptops', price: 849, rating: 4.4, reviews: 3412, score: 86,
    tagline: 'Featherweight everyday laptop',
    pros: ['Only 1.05 kg', 'Fanless and silent', 'Great value'],
    cons: ['8 GB base memory', 'Dim outdoors'],
    specs: { Processor: '8-core U-series', Memory: '8 GB', Storage: '256 GB SSD', Display: '13.3" FHD IPS', Battery: '14 hours', Weight: '1.05 kg' },
    tags: ['student', 'portable', 'budget'],
  },
  {
    id: 'lp-forge-15', name: 'Forge 15 Gaming', brand: 'Ironpeak', category: 'laptops', price: 1499, rating: 4.5, reviews: 1270, score: 84,
    tagline: 'High-refresh gaming without the bulk',
    pros: ['240 Hz display', 'Strong cooling', 'Upgradeable RAM'],
    cons: ['Average battery', 'Plastic chassis'],
    specs: { Processor: '14-core HX', Memory: '16 GB', Storage: '1 TB SSD', Display: '15.6" QHD 240 Hz', Battery: '6 hours', Weight: '2.25 kg' },
    tags: ['gaming', 'performance'],
  },
  // Smartphones
  {
    id: 'sp-lumen-x', name: 'Lumen X Pro', brand: 'Orbis', category: 'smartphones', price: 999, rating: 4.8, reviews: 5120, score: 95,
    tagline: 'Best-in-class camera and display',
    pros: ['Superb low-light camera', '7 years of updates', 'Bright 120 Hz panel'],
    cons: ['Premium price', 'Slow 30 W charging'],
    specs: { Display: '6.7" LTPO OLED', Chip: 'Flagship 3 nm', Camera: '50 MP triple', Battery: '5,000 mAh', Storage: '256 GB', Weight: '213 g' },
    tags: ['camera', 'flagship', 'photography'],
  },
  {
    id: 'sp-nova-a5', name: 'Nova A5', brand: 'Brightline', category: 'smartphones', price: 449, rating: 4.5, reviews: 4381, score: 90,
    tagline: 'Flagship features at a mid-range price',
    pros: ['Two-day battery', 'Clean software', 'Solid main camera'],
    cons: ['No wireless charging', 'Average zoom'],
    specs: { Display: '6.4" OLED 120 Hz', Chip: 'Mid-range 4 nm', Camera: '50 MP dual', Battery: '5,500 mAh', Storage: '128 GB', Weight: '190 g' },
    tags: ['budget', 'battery', 'value'],
  },
  {
    id: 'sp-pico-mini', name: 'Pico Mini', brand: 'Orbis', category: 'smartphones', price: 699, rating: 4.4, reviews: 1902, score: 83,
    tagline: 'Compact phone that fits any pocket',
    pros: ['One-handed size', 'Flagship chip', 'Great haptics'],
    cons: ['Smaller battery', 'Only two cameras'],
    specs: { Display: '5.9" OLED 120 Hz', Chip: 'Flagship 3 nm', Camera: '50 MP dual', Battery: '4,200 mAh', Storage: '128 GB', Weight: '168 g' },
    tags: ['compact', 'flagship'],
  },
  // Headphones
  {
    id: 'hp-quiet-900', name: 'QuietForm 900', brand: 'Sonara', category: 'headphones', price: 349, rating: 4.8, reviews: 6740, score: 96,
    tagline: 'Industry-leading noise cancellation',
    pros: ['Exceptional ANC', '30-hour battery', 'Very comfortable'],
    cons: ['Does not fold flat', 'Pricey'],
    specs: { Type: 'Over-ear', ANC: 'Adaptive, 8 mics', Battery: '30 hours', Codec: 'LDAC, AAC', Weight: '250 g', Multipoint: 'Yes' },
    tags: ['noise', 'travel', 'commute', 'anc'],
  },
  {
    id: 'hp-pulse-buds', name: 'Pulse Buds 2', brand: 'Brightline', category: 'headphones', price: 129, rating: 4.5, reviews: 8215, score: 88,
    tagline: 'Tiny earbuds with big sound',
    pros: ['Punchy, balanced sound', 'IPX5 water resistance', 'Great price'],
    cons: ['ANC is only average', 'Basic app'],
    specs: { Type: 'In-ear', ANC: 'Hybrid', Battery: '8 h (+24 h case)', Codec: 'AAC, SBC', Weight: '5 g / bud', Multipoint: 'Yes' },
    tags: ['budget', 'gym', 'earbuds'],
  },
  {
    id: 'hp-studio-r', name: 'Studio Reference R2', brand: 'Kalder Audio', category: 'headphones', price: 279, rating: 4.6, reviews: 1543, score: 85,
    tagline: 'Neutral sound for mixing and critical listening',
    pros: ['Accurate, detailed sound', 'Replaceable pads', 'Wide soundstage'],
    cons: ['Wired only', 'No noise cancelling'],
    specs: { Type: 'Open-back', ANC: 'None', Battery: 'Wired', Codec: '3.5 mm / 6.3 mm', Weight: '290 g', Multipoint: 'No' },
    tags: ['studio', 'music production', 'audiophile'],
  },
  // Smartwatches
  {
    id: 'sw-stride-3', name: 'Stride 3', brand: 'Tempo', category: 'smartwatches', price: 299, rating: 4.6, reviews: 3201, score: 91,
    tagline: 'Training-focused watch with dual-band GPS',
    pros: ['Accurate dual-band GPS', '12-day battery', 'Detailed training insights'],
    cons: ['Limited third-party apps', 'Plain design'],
    specs: { Display: '1.3" AMOLED', Battery: '12 days', GPS: 'Dual-band', 'Water rating': '5 ATM', Sensors: 'HR, SpO2, ECG', Weight: '42 g' },
    tags: ['running', 'fitness', 'battery'],
  },
  {
    id: 'sw-halo-s', name: 'Halo S', brand: 'Orbis', category: 'smartwatches', price: 399, rating: 4.7, reviews: 4890, score: 89,
    tagline: 'The smartest everyday companion',
    pros: ['Beautiful display', 'Huge app ecosystem', 'Smooth performance'],
    cons: ['Charge every night', 'Phone-ecosystem locked'],
    specs: { Display: '1.9" LTPO OLED', Battery: '36 hours', GPS: 'Single-band', 'Water rating': '5 ATM', Sensors: 'HR, SpO2, ECG, Temp', Weight: '38 g' },
    tags: ['smart', 'everyday', 'apps'],
  },
  // Cameras
  {
    id: 'cm-alpha-m6', name: 'Meridian M6', brand: 'Ostrava', category: 'cameras', price: 1699, rating: 4.8, reviews: 842, score: 93,
    tagline: 'Full-frame hybrid for photo and video',
    pros: ['Superb autofocus', '4K 60p, 10-bit', 'In-body stabilisation'],
    cons: ['Single card slot', 'Menus take learning'],
    specs: { Sensor: '33 MP full-frame', Video: '4K 60p 10-bit', Stabilisation: '5-axis IBIS', Viewfinder: '3.7M-dot OLED', Battery: '520 shots', Weight: '658 g' },
    tags: ['photography', 'video', 'professional'],
  },
  {
    id: 'cm-vlog-zv', name: 'Vlogger ZV-2', brand: 'Ostrava', category: 'cameras', price: 749, rating: 4.5, reviews: 1361, score: 87,
    tagline: 'Compact camera built for creators',
    pros: ['Flip-out screen', 'Great built-in mic', 'Pocketable'],
    cons: ['No viewfinder', 'Fixed lens'],
    specs: { Sensor: '20 MP 1-inch', Video: '4K 30p', Stabilisation: 'Digital', Viewfinder: 'None', Battery: '290 shots', Weight: '292 g' },
    tags: ['vlogging', 'video', 'compact', 'youtube'],
  },
  // Monitors
  {
    id: 'mn-clarity-27', name: 'Clarity 27 4K', brand: 'Viewmont', category: 'monitors', price: 429, rating: 4.6, reviews: 2290, score: 90,
    tagline: 'Sharp 4K panel for work and play',
    pros: ['Factory colour-calibrated', 'USB-C 90 W charging', 'Height-adjustable stand'],
    cons: ['60 Hz only', 'Basic speakers'],
    specs: { Size: '27"', Resolution: '3840 × 2160', 'Refresh rate': '60 Hz', Panel: 'IPS', Connectivity: 'USB-C 90 W, HDMI, DP', HDR: 'HDR400' },
    tags: ['productivity', 'coding', 'design'],
  },
  {
    id: 'mn-arc-34', name: 'Arc 34 Ultrawide', brand: 'Ironpeak', category: 'monitors', price: 599, rating: 4.5, reviews: 1187, score: 86,
    tagline: 'Immersive curved ultrawide at 165 Hz',
    pros: ['165 Hz refresh', 'Fast 1 ms response', 'Great for multitasking'],
    cons: ['Large desk footprint', 'Mediocre HDR'],
    specs: { Size: '34" curved', Resolution: '3440 × 1440', 'Refresh rate': '165 Hz', Panel: 'VA', Connectivity: 'HDMI 2.1, DP 1.4', HDR: 'HDR400' },
    tags: ['gaming', 'ultrawide', 'multitasking'],
  },
  // Tablets
  {
    id: 'tb-canvas-11', name: 'Canvas Pad 11', brand: 'Northwind', category: 'tablets', price: 599, rating: 4.7, reviews: 3870, score: 92,
    tagline: 'A sketchbook and notebook in one',
    pros: ['Low-latency stylus', 'Laminated 120 Hz display', 'Long battery'],
    cons: ['Stylus sold separately', 'Accessories pricey'],
    specs: { Display: '11" 120 Hz LCD', Chip: 'M-class 8-core', Storage: '128 GB', Stylus: 'Supported (2nd gen)', Battery: '10 hours', Weight: '466 g' },
    tags: ['drawing', 'notes', 'student'],
  },
  {
    id: 'tb-leaf-10', name: 'Leaf Tab 10', brand: 'Kestrel', category: 'tablets', price: 279, rating: 4.3, reviews: 2104, score: 82,
    tagline: 'Affordable tablet for reading and streaming',
    pros: ['Great value', 'Quad speakers', 'Expandable storage'],
    cons: ['Slower chip', '60 Hz display'],
    specs: { Display: '10.4" 2K LCD', Chip: 'Mid-range octa-core', Storage: '64 GB + microSD', Stylus: 'Not supported', Battery: '12 hours', Weight: '465 g' },
    tags: ['budget', 'reading', 'streaming'],
  },
  // Home
  {
    id: 'hm-roam-s8', name: 'Roam S8 Robot Vacuum', brand: 'Tidewell', category: 'home', price: 549, rating: 4.6, reviews: 2950, score: 91,
    tagline: 'Self-emptying vacuum and mop',
    pros: ['Strong 6,000 Pa suction', 'LiDAR mapping', 'Auto-empty dock'],
    cons: ['Tall dock', 'Mop does not lift on carpet'],
    specs: { Suction: '6,000 Pa', Navigation: 'LiDAR', Runtime: '180 minutes', Dock: 'Self-emptying', Mopping: 'Yes, sonic', Noise: '62 dB' },
    tags: ['cleaning', 'pets', 'automation'],
  },
  {
    id: 'hm-barista-one', name: 'Barista One', brand: 'Caffo', category: 'home', price: 699, rating: 4.7, reviews: 1714, score: 88,
    tagline: 'Café-quality espresso at home',
    pros: ['Built-in conical grinder', 'Precise temperature control', 'Steam wand'],
    cons: ['Learning curve', 'Takes counter space'],
    specs: { Type: 'Semi-automatic', Grinder: 'Conical burr, 30 settings', Pressure: '15 bar', 'Heat-up': '3 seconds', Tank: '2 L', 'Milk system': 'Manual steam wand' },
    tags: ['coffee', 'espresso', 'kitchen'],
  },
]

export const examplePrompts = [
  'Best laptop under $1,500 for coding and travel',
  'Noise cancelling headphones for long flights',
  'A phone with a great camera under $800',
  'Robot vacuum for a home with pets',
]

export interface SavedComparison {
  id: string
  title: string
  productIds: string[]
  createdAt: string
  note?: string
}

export const demoSavedComparisons: SavedComparison[] = [
  { id: 'cmp-1', title: 'Laptops for coding', productIds: ['lp-aurora-14', 'lp-slate-13', 'lp-vertex-16'], createdAt: '2026-11-11T10:24:00Z', note: 'Leaning towards the Aurora for battery life.' },
  { id: 'cmp-2', title: 'Travel headphones', productIds: ['hp-quiet-900', 'hp-pulse-buds'], createdAt: '2026-11-08T18:02:00Z' },
  { id: 'cmp-3', title: 'Mid-range phones', productIds: ['sp-nova-a5', 'sp-pico-mini', 'sp-lumen-x'], createdAt: '2026-11-02T09:15:00Z' },
  { id: 'cmp-4', title: 'Home office monitor', productIds: ['mn-clarity-27', 'mn-arc-34'], createdAt: '2026-10-27T14:40:00Z', note: 'Need USB-C charging.' },
]

export const demoSavedProductIds = ['hp-quiet-900', 'tb-canvas-11', 'sw-stride-3', 'hm-roam-s8']

export const demoUser = {
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  plan: 'Pro (demo)',
  location: 'London, UK',
  currency: 'USD',
}

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}

export function getCategory(id: CategoryId): Category {
  return categories.find((c) => c.id === id)!
}
