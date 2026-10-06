import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
  Line, Legend, Area, ComposedChart,
} from 'recharts'
import type { PositionAnalysis } from '../../types'
import { formatCurrency, taxOnGain } from '../../lib/taxEngine'
import { useViewData } from '../../store/useViewData'

interface Props {
  analysis: PositionAnalysis
}

const SELL_NOW = '#dc2626'
const WAIT = '#16a34a'
const BREAKEVEN = '#d97706'

function useAfterTaxIfHeld(analysis: PositionAnalysis) {
  const { settings } = useViewData()
  const { position: { shares }, totalCostBasis } = analysis
  return (price: number) => {
    const value = price * shares
    return value - taxOnGain(value - totalCostBasis, true, settings).total
  }
}

const kFormat = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`)

// ── Scenario Bar Chart ────────────────────────────────────────────────────────

function ScenarioBarChart({ analysis }: Props) {
  const { position, breakevenPrice, netProceedsNow } = analysis
  const afterTaxIfHeld = useAfterTaxIfHeld(analysis)
  const current = position.currentPrice

  const data = [
    { label: 'Sell today (STCG)', net: Math.round(netProceedsNow), fill: SELL_NOW, desc: `At ${formatCurrency(current, 2)}, short-term tax` },
    { label: `Falls to ${formatCurrency(breakevenPrice, 0)} (LTCG)`, net: Math.round(afterTaxIfHeld(breakevenPrice)), fill: BREAKEVEN, desc: 'Break-even: same net as selling today' },
    { label: 'Price flat → LTCG', net: Math.round(afterTaxIfHeld(current)), fill: WAIT, desc: `At ${formatCurrency(current, 2)}, long-term tax` },
  ]

  const minNet = Math.min(...data.map(d => d.net)) * 0.97

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs shadow-lg max-w-[200px]">
        <div className="font-semibold text-slate-900 mb-1">{d.label}</div>
        <div className="text-slate-500 mb-1">{d.desc}</div>
        <div className="text-slate-600">After-tax net: <span className="text-slate-900 font-mono font-bold">{formatCurrency(d.net)}</span></div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
        Bars 1 and 2 are equal by definition of break-even. Bar 3 is the payoff from waiting if the price
        is unchanged on the long-term date.
      </p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
          <YAxis domain={[minNet, 'auto']} tickFormatter={kFormat} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <ReferenceLine y={netProceedsNow} stroke={SELL_NOW} strokeDasharray="4 4" strokeWidth={1.5} />
          <Bar dataKey="net" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── After-tax payoff across future prices ─────────────────────────────────────

function PayoffChart({ analysis }: Props) {
  const { position, breakevenPrice, netProceedsNow, daysUntilLongTerm, dropCushionPercent } = analysis
  const afterTaxIfHeld = useAfterTaxIfHeld(analysis)
  const currentPrice = position.currentPrice
  const breakEvenPct = -dropCushionPercent

  // Range always includes the break-even point with some margin
  const lowPct = Math.max(-95, Math.min(-30, Math.floor(breakEvenPct / 5) * 5 - 10))
  const scenarios: Array<{ pct: number; sellNow: number; wait: number }> = []
  for (let pct = lowPct; pct <= 20; pct += 1) {
    const futurePrice = currentPrice * (1 + pct / 100)
    scenarios.push({ pct, sellNow: Math.round(netProceedsNow), wait: Math.round(afterTaxIfHeld(futurePrice)) })
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: number }) => {
    if (!active || !payload?.length || label == null) return null
    const wait = payload.find(p => p.dataKey === 'wait')?.value ?? 0
    const now = payload.find(p => p.dataKey === 'sellNow')?.value ?? 0
    const better = wait >= now
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs shadow-lg">
        <div className="font-semibold text-slate-900 mb-1.5">
          Price {label >= 0 ? '+' : ''}{label}% ({formatCurrency(currentPrice * (1 + label / 100), 2)})
        </div>
        <div className="flex justify-between gap-4" style={{ color: WAIT }}>
          <span>Wait for LTCG</span><span className="font-mono font-bold">{formatCurrency(wait)}</span>
        </div>
        <div className="flex justify-between gap-4" style={{ color: SELL_NOW }}>
          <span>Sell now</span><span className="font-mono font-bold">{formatCurrency(now)}</span>
        </div>
        <div className={`mt-1.5 font-semibold ${better ? 'text-green-700' : 'text-red-600'}`}>
          {better ? `✓ Waiting nets ${formatCurrency(wait - now)} more` : `✗ Selling now nets ${formatCurrency(now - wait)} more`}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-1 leading-relaxed">
        After-tax proceeds if you hold and sell on the long-term date, across possible prices on that date.
        Where the green line is above the red one, waiting wins.
      </p>
      <div className="text-xs text-slate-500 mb-3">
        Break-even: {breakEvenPct.toFixed(1)}% ({formatCurrency(breakevenPrice, 2)}) · {daysUntilLongTerm} days remaining
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={scenarios} margin={{ top: 12, right: 8, left: 5, bottom: 12 }}>
          <defs>
            <linearGradient id="waitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={WAIT} stopOpacity={0.18} />
              <stop offset="95%" stopColor={WAIT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="pct"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
            tick={{ fill: '#64748b', fontSize: 9 }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
            label={{ value: 'Price change by the long-term date', position: 'insideBottom', offset: -8, fill: '#94a3b8', fontSize: 9 }}
          />
          <YAxis tickFormatter={kFormat} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px', color: '#64748b' }} />
          <ReferenceLine x={breakEvenPct} stroke={BREAKEVEN} strokeDasharray="4 4" strokeWidth={1.5}
            label={{ value: 'break-even', fill: BREAKEVEN, fontSize: 9, position: 'insideTopLeft' }} />
          <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 4" />
          <Area type="linear" dataKey="wait" name="Wait for LTCG" stroke={WAIT} strokeWidth={2} fill="url(#waitGrad)" dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="sellNow" name="Sell now" stroke={SELL_NOW} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main exported component with tabs ─────────────────────────────────────────

export default function BreakevenChart({ analysis }: Props) {
  const [tab, setTab] = useState<'scenarios' | 'projection'>('projection')

  return (
    <div className="mt-3 bg-slate-50 rounded-lg border border-slate-200 p-4">
      <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-md p-0.5 w-fit">
        <TabBtn active={tab === 'projection'} onClick={() => setTab('projection')}>Payoff by Price</TabBtn>
        <TabBtn active={tab === 'scenarios'} onClick={() => setTab('scenarios')}>Scenario Compare</TabBtn>
      </div>
      {tab === 'projection' ? <PayoffChart analysis={analysis} /> : <ScenarioBarChart analysis={analysis} />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
        active ? 'bg-[#002B45] text-white' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  )
}
