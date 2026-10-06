import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { FutureVestLot, Position, UserSettings } from '../types'
import { effectiveVol, longTermDate } from './taxEngine'

// Demo / privacy data. Everything here is a pure function of (real data, seed,
// date) so the same seed always yields the same demo, and the real portfolio
// in the store is never modified.

export interface ViewData {
  positions: Position[]
  futureVests: FutureVestLot[]
  settings: UserSettings
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Rng {
  private next: () => number
  constructor(seed: number) { this.next = mulberry32(seed) }
  uniform(lo = 0, hi = 1) { return lo + (hi - lo) * this.next() }
  int(lo: number, hi: number) { return Math.floor(this.uniform(lo, hi + 1)) }
  /** Log-uniform: equally likely to halve as to double. */
  logUniform(lo: number, hi: number) { return Math.exp(this.uniform(Math.log(lo), Math.log(hi))) }
  normal() {
    const u = Math.max(1e-12, this.next())
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next())
  }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)] }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

// ── Fictional companies ───────────────────────────────────────────────────────
// Invented companies so a demo never implies a real holding or real market
// price. Symbols were picked to look plausible; one could still coincide with
// an obscure real listing.
// `vol` is an annualized % used as the position's volatility override.

const FICTIONAL: ReadonlyArray<{ ticker: string; name: string; vol: number }> = [
  { ticker: 'ACME', name: 'Acme Industrial Holdings', vol: 18 },
  { ticker: 'NVCX', name: 'Novacore Systems Inc.', vol: 42 },
  { ticker: 'HLXB', name: 'Helix Biotherapeutics', vol: 58 },
  { ticker: 'BRWL', name: 'Bridgewell Financial Corp.', vol: 21 },
  { ticker: 'ORBT', name: 'Orbital Data Networks', vol: 36 },
  { ticker: 'GRNF', name: 'Greenfield Utilities Co.', vol: 15 },
  { ticker: 'QNTA', name: 'Quanta Robotics Ltd.', vol: 65 },
  { ticker: 'SLTE', name: 'Slate Cloud Software', vol: 33 },
  { ticker: 'MRDN', name: 'Meridian Consumer Brands', vol: 20 },
  { ticker: 'VFIV', name: 'Vertex Five Semiconductors', vol: 48 },
  { ticker: 'CSLG', name: 'Coastal Logistics Group', vol: 26 },
  { ticker: 'PNCL', name: 'Pinnacle Media & Gaming', vol: 39 },
  { ticker: 'TRLN', name: 'Trillion Index Fund (demo)', vol: 15 },
  { ticker: 'AURH', name: 'Aura Health Platforms', vol: 31 },
  { ticker: 'KSTR', name: 'Kestrel Aerospace', vol: 29 },
  { ticker: 'LMNA', name: 'Lumina Solar Energy', vol: 52 },
  { ticker: 'DRFT', name: 'Driftwood Retail Co.', vol: 27 },
  { ticker: 'ZPHR', name: 'Zephyr Mobility Inc.', vol: 70 },
  { ticker: 'OKWD', name: 'Oakwood Insurance Group', vol: 17 },
  { ticker: 'SYNP', name: 'Synapse AI Labs', vol: 60 },
]

/**
 * Maps each real ticker to a distinct fictional one with the closest
 * volatility, so risk ratings stay roughly comparable after masking.
 */
function buildTickerMap(
  positions: Position[], futureVests: FutureVestLot[], rng: Rng,
): Map<string, { ticker: string; name: string; vol: number }> {
  const vols = new Map<string, number>()
  for (const p of positions) if (!vols.has(p.ticker)) vols.set(p.ticker, effectiveVol(p).vol)
  for (const v of futureVests) if (!vols.has(v.ticker)) vols.set(v.ticker, effectiveVol({ ticker: v.ticker }).vol)

  const pool = rng.shuffle(FICTIONAL)
  const map = new Map<string, { ticker: string; name: string; vol: number }>()
  let overflow = 0
  for (const [real, vol] of vols) {
    let bestIdx = -1
    for (let i = 0; i < pool.length; i++) {
      if (bestIdx < 0 || Math.abs(pool[i].vol - vol) < Math.abs(pool[bestIdx].vol - vol)) bestIdx = i
    }
    if (bestIdx >= 0) {
      map.set(real, pool[bestIdx])
      pool.splice(bestIdx, 1)
    } else {
      overflow++
      map.set(real, { ticker: `DMO${overflow}`, name: `Demo Holding ${overflow}`, vol })
    }
  }
  return map
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Moves a purchase date by a few days without changing whether the lot is
 * long-term today, and never into the future.
 */
function jitterPurchaseDate(purchaseDate: string, today: Date, rng: Rng): string {
  const original = parseISO(purchaseDate)
  const wasLongTerm = differenceInCalendarDays(longTermDate(purchaseDate), today) <= 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = addDays(original, rng.int(-9, 9))
    if (differenceInCalendarDays(candidate, today) > 0) continue
    const isLongTerm = differenceInCalendarDays(longTermDate(iso(candidate)), today) <= 0
    if (isLongTerm === wasLongTerm) return iso(candidate)
  }
  return purchaseDate
}

function roundShares(shares: number, originalWasWhole: boolean): number {
  if (originalWasWhole || shares >= 50) return Math.max(1, Math.round(shares))
  return Math.max(0.001, Math.round(shares * 1000) / 1000)
}

function roundIncome(income: number): number {
  return Math.max(0, Math.round(income / 5000) * 5000)
}

// ── Anonymize: same shape as the real portfolio, different numbers ─────────────

/**
 * Keeps the portfolio's structure (number of lots, which lots are short- vs
 * long-term, rough gain/loss pattern, relative volatility) while scaling all
 * dollar amounts, perturbing prices and dates, and optionally renaming tickers.
 */
export function anonymizePortfolio(
  real: ViewData, seed: number, maskTickers: boolean, today: Date = new Date(),
): ViewData {
  const rng = new Rng(seed)
  const sizeScale = rng.logUniform(0.35, 2.5)               // one factor for all share counts
  const tickerMap = maskTickers ? buildTickerMap(real.positions, real.futureVests, rng) : null

  const priceFactor = new Map<string, number>()             // one factor per ticker, so lots stay consistent
  const factorFor = (ticker: string) => {
    if (!priceFactor.has(ticker)) priceFactor.set(ticker, rng.logUniform(0.5, 2))
    return priceFactor.get(ticker)!
  }

  const positions: Position[] = real.positions.map((p, i) => {
    const f = factorFor(p.ticker)
    const mapped = tickerMap?.get(p.ticker)
    // Small basis noise so the gain % is not an exact match of the real one
    const basisNoise = Math.exp(0.04 * rng.normal())
    const shares = roundShares(p.shares * sizeScale * rng.uniform(0.85, 1.15), Number.isInteger(p.shares))
    return {
      ...p,
      id: `demo-${i}`,
      ticker: mapped?.ticker ?? p.ticker,
      name: mapped?.name ?? p.name,
      shares,
      costBasisPerShare: round2(p.costBasisPerShare * f * basisNoise),
      currentPrice: round2(p.currentPrice * f),
      purchaseDate: jitterPurchaseDate(p.purchaseDate, today, rng),
      volatilityOverride: mapped ? (p.volatilityOverride ?? effectiveVol(p).vol) : p.volatilityOverride,
    }
  })

  const futureVests: FutureVestLot[] = real.futureVests.map((v, i) => {
    const mapped = tickerMap?.get(v.ticker)
    const vestDate = addDays(parseISO(v.vestDate), rng.int(-5, 5))
    return {
      ...v,
      id: `demo-vest-${i}`,
      ticker: mapped?.ticker ?? v.ticker,
      name: mapped?.name ?? v.name,
      awardId: v.awardId ? String(rng.int(1_000_000, 9_999_999)) : '',
      awardDate: v.awardDate ? iso(addDays(parseISO(v.awardDate), rng.int(-20, 20))) : v.awardDate,
      vestDate: iso(differenceInCalendarDays(vestDate, today) > 0 ? vestDate : addDays(today, 1)),
      sharesGross: Math.max(1, Math.round(v.sharesGross * sizeScale)),
    }
  })

  const settings: UserSettings = {
    ...real.settings,
    annualTaxableIncome: roundIncome(real.settings.annualTaxableIncome * rng.logUniform(0.75, 1.33)),
  }

  return { positions, futureVests, settings }
}

// ── Sample: fully synthetic but realistic portfolio ───────────────────────────

/**
 * Builds an invented portfolio: an "employer" stock with quarterly RSU vests
 * plus several brokerage holdings. Cost bases come from simulating each
 * stock's price backwards with its volatility, so gains and losses look like
 * real market outcomes rather than uniform noise.
 */
export function generateSamplePortfolio(
  seed: number, baseSettings: UserSettings, today: Date = new Date(),
): ViewData {
  const rng = new Rng(seed)
  const companies = rng.shuffle(FICTIONAL).slice(0, rng.int(5, 7))
  const [employer, ...others] = companies
  const positions: Position[] = []
  const nowIso = new Date().toISOString()
  const prices = new Map<string, number>()

  // Price `days` ago, simulated backwards from today's price with the stock's
  // own vol. The drift is generous (25%/yr) and the noise is damped so most lots
  // show gains, which is what makes the sell-vs-wait analysis interesting.
  const historicalPrice = (current: number, vol: number, days: number) => {
    const t = days / 365
    const s = 0.7 * (vol / 100) * Math.sqrt(t)
    return current / Math.exp(0.25 * t + s * rng.normal())
  }

  const addLot = (c: typeof employer, daysAgo: number, shares: number) => {
    const price = prices.get(c.ticker)!
    positions.push({
      id: `sample-${positions.length}`,
      ticker: c.ticker,
      name: c.name,
      shares,
      costBasisPerShare: round2(historicalPrice(price, c.vol, daysAgo)),
      purchaseDate: iso(addDays(today, -daysAgo)),
      currentPrice: price,
      volatilityOverride: c.vol,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
  }

  for (const c of companies) prices.set(c.ticker, round2(rng.logUniform(25, 450)))

  // Employer RSUs: net shares from quarterly vests over the last ~2 years
  const employerPrice = prices.get(employer.ticker)!
  const vestShares = Math.max(4, Math.round(rng.logUniform(8_000, 40_000) / employerPrice))
  const firstOffset = rng.int(10, 80)
  for (let q = 0; q < 8; q++) {
    addLot(employer, firstOffset + q * 91, Math.max(1, Math.round(vestShares * 0.54 * rng.uniform(0.9, 1.1))))
  }

  // Brokerage holdings: 1–2 lots each, half of them inside the short-term window
  for (const c of others) {
    const lots = rng.int(1, 2)
    for (let l = 0; l < lots; l++) {
      const daysAgo = rng.uniform() < 0.55 ? rng.int(15, 360) : rng.int(370, 900)
      const value = rng.logUniform(4_000, 60_000)
      addLot(c, daysAgo, Math.max(1, Math.round(value / prices.get(c.ticker)!)))
    }
  }

  const futureVests: FutureVestLot[] = []
  const awardId = String(rng.int(1_000_000, 9_999_999))
  const awardDate = iso(addDays(today, -firstOffset - 7 * 91 - 30))
  for (let q = 1; q <= 8; q++) {
    futureVests.push({
      id: `sample-vest-${q}`,
      ticker: employer.ticker,
      name: employer.name,
      awardId,
      awardDate,
      vestDate: iso(addDays(today, 91 * q - firstOffset)),
      sharesGross: vestShares,
    })
  }

  const settings: UserSettings = {
    ...baseSettings,
    annualTaxableIncome: roundIncome(rng.logUniform(110_000, 420_000)),
  }

  return {
    positions,
    futureVests: futureVests.filter(v => v.vestDate > iso(today)),
    settings,
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
