import { format, parseISO } from 'date-fns'
import type { FutureVestLot, Position } from '../types'

// Pure helpers behind the Future Vesting view.

/** Share of gross RSUs kept after sell-to-cover withholding (≈46% withheld). */
export const VEST_RETENTION = 0.54

/** Vests strictly after `today` (YYYY-MM-DD), soonest first. Past ones are already holdings. */
export function upcomingVests(vests: FutureVestLot[], today: string): FutureVestLot[] {
  return vests.filter(v => v.vestDate > today).sort((a, b) => a.vestDate.localeCompare(b.vestDate))
}

export interface VestMonth {
  monthKey: string   // YYYY-MM
  monthLabel: string // "June 2026"
  lots: FutureVestLot[]
  sharesGross: number
  awardIds: string[]
}

export function groupByMonth(vests: FutureVestLot[]): VestMonth[] {
  const map = new Map<string, FutureVestLot[]>()
  for (const vest of vests) {
    const key = vest.vestDate.slice(0, 7)
    const arr = map.get(key) ?? []
    arr.push(vest)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, lots]) => ({
      monthKey: key,
      monthLabel: format(parseISO(`${key}-01`), 'MMMM yyyy'),
      lots,
      sharesGross: lots.reduce((s, l) => s + l.sharesGross, 0),
      awardIds: [...new Set(lots.map(l => l.awardId).filter(Boolean))],
    }))
}

// Share classes that trade at nearly the same price
const SAME_PRICE: Record<string, string> = { GOOG: 'GOOGL', GOOGL: 'GOOG' }

/**
 * Ticker → current price from held lots (the first valid price per ticker).
 * A vest in GOOG falls back to a held GOOGL price and vice versa.
 */
export function buildPriceMap(positions: Position[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const p of positions) {
    if (!(p.ticker in map) && Number.isFinite(p.currentPrice) && p.currentPrice > 0) map[p.ticker] = p.currentPrice
  }
  for (const [a, b] of Object.entries(SAME_PRICE)) {
    if (!(a in map) && b in map) map[a] = map[b]
  }
  return map
}

/** Gross value of `vests` at today's prices; tickers without a price are left out. */
export function estimateGrossValue(vests: FutureVestLot[], priceMap: Record<string, number>): number {
  return vests.reduce((s, v) => s + (priceMap[v.ticker] != null ? v.sharesGross * priceMap[v.ticker] : 0), 0)
}
