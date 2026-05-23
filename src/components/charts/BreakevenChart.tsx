import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
  Line, Legend, Area, AreaChart,
} from 'recharts'
import type { PositionAnalysis } from '../../types'
import { formatCurrency } from '../../lib/taxEngine'

interface Props {
  analysis: PositionAnalysis
}

// ── Scenario Bar Chart ────────────────────────────────────────────────────────

function ScenarioBarChart({ analysis }: Props) {
  const {
    position, breakevenPrice, netProceedsNow, taxIfSoldAsLTCG,
    ltcgCombinedRate, totalCostBasis, currentValue, position: { shares },
  } = analysis

  const current = position.currentPrice
  const netAtBreakeven = breakevenPrice * shares
    - Math.max(0, breakevenPrice * shares - totalCostBasis) * ltcgCombinedRate
  const netAtCurrentLTCG = currentValue - taxIfSoldAsLTCG

  const data = [
    { label: 'Sell today (STCG)', net: Math.round(netProceedsNow), price: current, fill: '#f87171', desc: `At $${current.toFixed(2)}, short-term tax` },
    { label: `If drops to $${breakevenPrice.toFixed(0)} (LTCG)`, net: Math.round(netAtBreakeven), price: breakevenPrice, fill: '#fbbf24', desc: `Break-even: same net as selling today` },
    { label: 'Stock flat → LTCG', net: Math.round(netAtCurrentLTCG), price: current, fill: '#4ade80', desc: `At $${current.toFixed(2)}, long-term tax` },
  ]

  const minNet = Math.min(...data.map(d => d.net)) * 0.97

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl max-w-[180px]">
        <div className="font-semibold text-white mb-1">{d.label}</div>
        <div className="text-slate-400 mb-1">{d.desc}</div>
        <div className="text-slate-300">After-tax net: <span className="text-white font-mono font-bold">{formatCurrency(d.net)}</span></div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
        Bars 1 and 2 show equal after-tax proceeds — that's the definition of break-even. Bar 3 shows the
        upside: if the stock holds its price until the 1-year mark, you net more by waiting.
      </p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 9 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
          />
          <YAxis
            domain={[minNet, 'auto']}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.05)' }} />
          <ReferenceLine y={netProceedsNow} stroke="#f87171" strokeDasharray="4 4" strokeWidth={1.5}
            label={{ value: 'sell-now net', fill: '#f87171', fontSize: 9, position: 'right' }} />
          <Bar dataKey="net" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Time-Series Projection Chart ──────────────────────────────────────────────

function TimeSeriesChart({ analysis }: Props) {
  const {
    position, breakevenPrice, totalCostBasis,
    ltcgCombinedRate, stcgCombinedRate,
    daysUntilLongTerm, daysHeld,
  } = analysis

  const basis = position.costBasisPerShare
  const currentPrice = position.currentPrice
  const shares = position.shares
  const netNow = totalCostBasis + (currentPrice - basis) * shares * (1 - stcgCombinedRate)

  // Generate price scenarios: from -30% to +20% of current
  const scenarios: { priceDrop: number; label: string; stcgNet: number; ltcgNet: number; breakEven: boolean }[] = []
  for (let pct = -30; pct <= 20; pct += 2) {
    const futurePrice = currentPrice * (1 + pct / 100)
    if (futurePrice < 0) continue
    const gain = Math.max(0, futurePrice * shares - totalCostBasis)
    const ltcgNet = futurePrice * shares - gain * ltcgCombinedRate
    const isBreakeven = Math.abs(pct - (-(((currentPrice - breakevenPrice) / currentPrice) * 100))) < 1.5
    scenarios.push({
      priceDrop: pct,
      label: `${pct >= 0 ? '+' : ''}${pct}%`,
      stcgNet: Math.round(netNow),     // sell-now net is fixed regardless of future price
      ltcgNet: Math.round(ltcgNet),
      breakEven: isBreakeven,
    })
  }

  const breakEvenDrop = -(((currentPrice - breakevenPrice) / currentPrice) * 100)

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const pct = parseFloat(label ?? '0')
    const futurePrice = currentPrice * (1 + pct / 100)
    const better = (payload.find(p => p.name === 'LTCG net')?.value ?? 0) >= (payload.find(p => p.name === 'Sell now')?.value ?? 0)
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
        <div className="font-semibold text-white mb-1.5">
          Stock at {label} ({formatCurrency(futurePrice, 2)})
        </div>
        {payload.map(p => (
          <div key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="font-mono font-bold">{formatCurrency(p.value)}</span>
          </div>
        ))}
        <div className={`mt-1.5 text-xs font-semibold ${better ? 'text-green-400' : 'text-red-400'}`}>
          {better ? '✓ Waiting is better' : '✗ Selling now was better'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-1 leading-relaxed">
        After-tax proceeds across different future price scenarios when you sell at the 1-year mark.
        Where the green line exceeds the red line, waiting for LTCG wins.
      </p>
      <div className="text-xs text-slate-600 mb-3">
        Break-even: stock drops ~{Math.abs(breakEvenDrop).toFixed(1)}% ({formatCurrency(breakevenPrice, 2)}) ·
        Days remaining: {daysUntilLongTerm} · Days held: {daysHeld}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={scenarios} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="ltcgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4ade80" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 9 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
            label={{ value: 'Future price change from today', position: 'insideBottom', offset: -3, fill: '#64748b', fontSize: 9 }}
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '10px', color: '#94a3b8', paddingTop: '4px' }} />
          <ReferenceLine
            x={`${breakEvenDrop >= 0 ? '+' : ''}${Math.round(breakEvenDrop)}%`}
            stroke="#fbbf24"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: 'break-even', fill: '#fbbf24', fontSize: 9, position: 'top' }}
          />
          <ReferenceLine x="+0%" stroke="#64748b" strokeWidth={1} strokeDasharray="2 4" />
          <Area
            type="monotone"
            dataKey="ltcgNet"
            name="LTCG net"
            stroke="#4ade80"
            strokeWidth={2}
            fill="url(#ltcgGrad)"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="stcgNet"
            name="Sell now"
            stroke="#f87171"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-600 mt-1">
        🟢 Green above red = LTCG wins · 🔴 Red above green = selling today was better
      </p>
    </div>
  )
}

// ── Main exported component with tabs ─────────────────────────────────────────

export default function BreakevenChart({ analysis }: Props) {
  const [tab, setTab] = useState<'scenarios' | 'projection'>('projection')

  return (
    <div className="mt-3 bg-slate-700/20 rounded-xl border border-slate-700/50 p-4">
      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-slate-700/40 rounded-lg p-0.5 w-fit">
        <TabBtn active={tab === 'projection'} onClick={() => setTab('projection')}>
          📈 Price Projection
        </TabBtn>
        <TabBtn active={tab === 'scenarios'} onClick={() => setTab('scenarios')}>
          📊 Scenario Compare
        </TabBtn>
      </div>

      {tab === 'projection'
        ? <TimeSeriesChart analysis={analysis} />
        : <ScenarioBarChart analysis={analysis} />
      }
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
        active ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
