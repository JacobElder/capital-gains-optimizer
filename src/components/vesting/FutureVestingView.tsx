import { useMemo } from 'react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAppStore } from '../../store/useAppStore'
import { formatCurrency } from '../../lib/taxEngine'
import type { FutureVestLot } from '../../types'

// Ticker → color for bar chart
const TICKER_COLORS: Record<string, string> = {
  GOOG: '#6366f1',
  GOOGL: '#6366f1',
  MSFT: '#22d3ee',
  AMZN: '#f59e0b',
  META: '#3b82f6',
  AAPL: '#a3e635',
  NVDA: '#10b981',
}
function tickerColor(ticker: string) {
  return TICKER_COLORS[ticker] ?? '#818cf8'
}

function groupByMonth(vests: FutureVestLot[]): Array<{
  monthKey: string   // YYYY-MM
  monthLabel: string // "June 2026"
  lots: FutureVestLot[]
  sharesGross: number
  awardIds: string[]
}> {
  const map = new Map<string, FutureVestLot[]>()
  for (const vest of vests) {
    const key = vest.vestDate.slice(0, 7) // YYYY-MM
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

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: { monthLabel: string; sharesGross: number; ticker?: string }; value: number }>
  label?: string
  priceMap: Record<string, number>
}

function VestTooltip({ active, payload, priceMap }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const ticker = d.ticker ?? ''
  const price = priceMap[ticker]
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl min-w-[150px]">
      <div className="font-bold text-white mb-1">{d.monthLabel}</div>
      <div className="text-slate-300">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Gross shares</span>
          <span className="font-mono">{d.sharesGross.toLocaleString()}</span>
        </div>
        {price != null && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Est. value</span>
            <span className="font-mono">{formatCurrency(d.sharesGross * price)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FutureVestingView() {
  const { futureVests, positions, clearFutureVests } = useAppStore()

  // Build a price map from current positions
  const priceMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of positions) {
      if (!(p.ticker in map)) map[p.ticker] = p.currentPrice
    }
    return map
  }, [positions])

  if (futureVests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="text-5xl">📅</div>
        <div className="text-white font-bold text-xl">No future vesting data</div>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
          Import your Schwab Equity Awards Center (EAC) export to see upcoming vest events.
          The file includes a "RESTRICTED STOCK UNITS" section with your vesting schedule.
        </p>
      </div>
    )
  }

  const months = useMemo(() => groupByMonth(futureVests), [futureVests])

  // Summary stats
  const totalShares = futureVests.reduce((s, v) => s + v.sharesGross, 0)
  const uniqueTickers = [...new Set(futureVests.map(v => v.ticker))]

  // Estimated value: group by ticker, multiply by known price
  const estimatedGrossValue = useMemo(() => {
    let total = 0
    for (const ticker of uniqueTickers) {
      const price = priceMap[ticker]
      if (price == null) continue
      const shares = futureVests.filter(v => v.ticker === ticker).reduce((s, v) => s + v.sharesGross, 0)
      total += shares * price
    }
    return total
  }, [futureVests, priceMap, uniqueTickers])

  const hasAnyPrice = uniqueTickers.some(t => priceMap[t] != null)

  // Next vest
  const sortedVests = [...futureVests].sort((a, b) => a.vestDate.localeCompare(b.vestDate))
  const nextVest = sortedVests[0]
  const daysUntilNext = nextVest
    ? differenceInCalendarDays(parseISO(nextVest.vestDate), new Date())
    : null

  // Net shares estimate (54% retained ≈ 46% withheld)
  const RETENTION = 0.54
  const estimatedNetShares = Math.round(totalShares * RETENTION)

  // Bar chart data
  const chartData = months.map(m => {
    // For mixed-ticker months, just use first ticker color
    const ticker = m.lots[0]?.ticker ?? ''
    return {
      monthLabel: m.monthLabel,
      sharesGross: m.sharesGross,
      ticker,
    }
  })

  function handleClear() {
    if (window.confirm('Clear all future vesting data? This cannot be undone.')) {
      clearFutureVests()
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-300 mb-3">Vesting Summary</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Total Future Shares</div>
            <div className="font-mono font-bold text-base text-white">{totalShares.toLocaleString()}</div>
            <div className="text-xs text-slate-600 mt-0.5">gross (before withholding)</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Est. Gross Value</div>
            {hasAnyPrice ? (
              <div className="font-mono font-bold text-base text-white">{formatCurrency(estimatedGrossValue)}</div>
            ) : (
              <div className="font-mono font-bold text-base text-slate-500">—</div>
            )}
            <div className="text-xs text-slate-600 mt-0.5">at current price</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Upcoming Events</div>
            <div className="font-mono font-bold text-base text-white">{futureVests.length}</div>
            <div className="text-xs text-slate-600 mt-0.5">vest lots</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Next Vest In</div>
            {daysUntilNext != null ? (
              <div className="font-mono font-bold text-base text-indigo-300">{daysUntilNext} day{daysUntilNext !== 1 ? 's' : ''}</div>
            ) : (
              <div className="font-mono font-bold text-base text-slate-500">—</div>
            )}
            {nextVest && (
              <div className="text-xs text-slate-600 mt-0.5">{nextVest.vestDate}</div>
            )}
          </div>
        </div>

        {/* Withholding callout */}
        <div className="mt-4 bg-amber-950/30 border border-amber-800/30 rounded-lg px-3 py-2.5 text-xs">
          <span className="text-amber-400 font-semibold">Withholding estimate:</span>
          <span className="text-slate-400 ml-1">
            Typical RSU withholding is 40–50%. At 46% withheld, estimated net shares ≈{' '}
            <span className="font-mono font-semibold text-white">{estimatedNetShares.toLocaleString()}</span>
            {hasAnyPrice && estimatedGrossValue > 0 && (
              <span className="text-slate-400"> ({formatCurrency(estimatedGrossValue * RETENTION)} est. net value)</span>
            )}.
          </span>
        </div>
      </div>

      {/* Monthly bar chart */}
      {months.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-300 mb-1">Vesting Timeline</div>
          <div className="text-xs text-slate-500 mb-3">Gross shares per month</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
              />
              <Tooltip content={<VestTooltip priceMap={priceMap} />} cursor={{ fill: '#1e293b' }} />
              <Bar dataKey="sharesGross" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={tickerColor(d.ticker)} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Ticker legend */}
          <div className="flex gap-3 mt-1 flex-wrap">
            {uniqueTickers.map(ticker => (
              <span key={ticker} className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: tickerColor(ticker) }} />
                {ticker}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Monthly timeline table */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/40">
          <div className="text-xs font-semibold text-slate-300">Monthly Schedule</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700/30 text-slate-400">
                <th className="text-left px-4 py-2.5">Month</th>
                <th className="text-right px-4 py-2.5">Gross Shares</th>
                <th className="text-right px-4 py-2.5">Est. Net Shares</th>
                <th className="text-right px-4 py-2.5">Est. Value</th>
                <th className="text-left px-4 py-2.5">Award IDs</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const tickers = [...new Set(m.lots.map(l => l.ticker))]
                const estValue = tickers.reduce((s, t) => {
                  const price = priceMap[t]
                  if (price == null) return s
                  const shares = m.lots.filter(l => l.ticker === t).reduce((a, l) => a + l.sharesGross, 0)
                  return s + shares * price
                }, 0)
                const hasPrice = tickers.some(t => priceMap[t] != null)
                return (
                  <tr key={m.monthKey} className="border-t border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-4 py-2.5 font-semibold text-white">{m.monthLabel}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{m.sharesGross.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                      ~{Math.round(m.sharesGross * RETENTION).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {hasPrice ? formatCurrency(estValue) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                      {m.awardIds.join(', ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clear button */}
      <div className="flex justify-end">
        <button
          onClick={handleClear}
          className="border border-red-900/60 hover:border-red-700 text-red-400/70 hover:text-red-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          Clear Vesting Data
        </button>
      </div>
    </div>
  )
}
