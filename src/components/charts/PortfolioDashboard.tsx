import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import type { PositionAnalysis } from '../../types'
import { formatCurrency, riskSigmaContext } from '../../lib/taxEngine'

// ── helpers ───────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  high: '#f87171',
  moderate: '#fbbf24',
  low: '#4ade80',
  loss: '#64748b',
  'already-ltcg': '#818cf8',
  'stcg-preferred': '#c084fc',
}

// Abramowitz & Stegun approximation of the standard normal CDF
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
  const cdf = 1 - d * p
  return x >= 0 ? cdf : 1 - cdf
}

function positionProbability(a: PositionAnalysis): number | null {
  if (a.isLoss || a.isLongTerm || a.stcgPreferred) return null
  const { sigmaPct } = riskSigmaContext(a.daysUntilLongTerm)
  return normalCDF(a.dropCushionPercent / sigmaPct)
}

// ── scatter tooltip ───────────────────────────────────────────────────────────

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
      <div className="font-bold text-white text-sm mb-1.5">{d.ticker}</div>
      <div className="space-y-0.5 text-slate-300">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Value</span>
          <span className="font-mono">{formatCurrency(d.value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Gain</span>
          <span className={`font-mono ${d.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {d.gain >= 0 ? '+' : ''}{formatCurrency(d.gain)}
          </span>
        </div>
        {d.savings > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Tax savings</span>
            <span className="font-mono text-indigo-300">{formatCurrency(d.savings)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Days left</span>
          <span className="font-mono">{d.daysUntil === 0 ? 'LTCG ✓' : d.daysUntil}</span>
        </div>
        {d.prob != null && (
          <div className="flex justify-between gap-4 pt-1 border-t border-slate-700 mt-1">
            <span className="text-slate-500">P(reach LTCG)</span>
            <span className={`font-mono font-semibold ${d.prob >= 0.85 ? 'text-green-400' : d.prob >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
              {(d.prob * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── types ─────────────────────────────────────────────────────────────────────

interface ScatterPoint {
  x: number       // days until LTCG
  y: number       // tax savings (>=0)
  z: number       // bubble size (position value)
  ticker: string
  risk: string
  value: number
  gain: number
  savings: number
  daysUntil: number
  prob: number | null
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  analyses: PositionAnalysis[]
}

export default function PortfolioDashboard({ analyses }: Props) {
  const {
    totalValue, totalGain, totalSavings,
    byRisk, weightedProbability, scatterData,
    totalLosses, totalGainsOnly, netGainAfterHarvesting, taxSavedByHarvesting,
  } = useMemo(() => {
    const totalValue = analyses.reduce((s, a) => s + a.currentValue, 0)
    const totalGain = analyses.reduce((s, a) => s + a.gainAmount, 0)
    const actionable = analyses.filter(a => !a.isLoss && !a.isLongTerm && !a.stcgPreferred)
    const totalSavings = actionable.reduce((s, a) => s + a.taxSavingsFromWaiting, 0)

    const byRisk = {
      high: analyses.filter(a => a.riskLevel === 'high'),
      moderate: analyses.filter(a => a.riskLevel === 'moderate'),
      low: analyses.filter(a => a.riskLevel === 'low'),
      loss: analyses.filter(a => a.isLoss),
      ltcg: analyses.filter(a => a.isLongTerm),
    }

    // Weighted-average probability of reaching LTCG without crossing break-even
    // Weight each position by its tax savings (what's at stake)
    const weightedNum = actionable.reduce((s, a) => {
      const prob = positionProbability(a) ?? 1
      return s + prob * a.taxSavingsFromWaiting
    }, 0)
    const weightedProbability = totalSavings > 0 ? weightedNum / totalSavings : null

    const scatterData: ScatterPoint[] = analyses.map(a => ({
      x: a.isLongTerm ? 0 : a.daysUntilLongTerm,
      y: Math.max(0, a.taxSavingsFromWaiting),
      z: Math.max(a.currentValue, 500),
      ticker: a.position.ticker,
      risk: a.riskLevel,
      value: a.currentValue,
      gain: a.gainAmount,
      savings: a.taxSavingsFromWaiting,
      daysUntil: a.daysUntilLongTerm,
      prob: positionProbability(a),
    }))

    // Tax-loss harvesting
    const losingPositions = analyses.filter(a => a.isLoss)
    const totalLosses = losingPositions.reduce((s, a) => s + Math.abs(a.gainAmount), 0)
    const totalGainsOnly = analyses.filter(a => a.gainAmount > 0).reduce((s, a) => s + a.gainAmount, 0)
    const netGainAfterHarvesting = Math.max(0, totalGainsOnly - totalLosses)
    const avgSTCGRate = losingPositions.length > 0
      ? losingPositions.reduce((s, a) => s + a.stcgCombinedRate, 0) / losingPositions.length
      : (analyses[0]?.stcgCombinedRate ?? 0.37)
    const taxSavedByHarvesting = Math.min(totalLosses, totalGainsOnly) * avgSTCGRate

    return { totalValue, totalGain, totalSavings, byRisk, weightedProbability, scatterData, totalLosses, totalGainsOnly, netGainAfterHarvesting, taxSavedByHarvesting }
  }, [analyses])

  const n = analyses.length

  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 mb-5 space-y-4">
      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatItem label="Portfolio Value" value={formatCurrency(totalValue)} />
        <StatItem
          label="Total Unrealized Gain"
          value={formatCurrency(totalGain)}
          positive={totalGain > 0}
          negative={totalGain < 0}
        />
        <StatItem
          label="Potential Tax Savings"
          value={formatCurrency(totalSavings)}
          positive={totalSavings > 0}
          sublabel="if all STCG lots held to LTCG"
        />
        <div>
          <div className="text-xs text-slate-500 mb-1.5">Chance of Capturing Savings</div>
          {weightedProbability != null ? (
            <div>
              <div className={`font-mono font-bold text-base ${
                weightedProbability >= 0.85 ? 'text-green-400' :
                weightedProbability >= 0.65 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {(weightedProbability * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-600 mt-0.5">prob. STCG lots stay above break-even til LTCG</div>
            </div>
          ) : (
            <div className="text-slate-500 text-sm">—</div>
          )}
        </div>
      </div>

      {/* ── Risk distribution bar ── */}
      <div>
        <div className="text-xs text-slate-500 mb-2">Risk distribution — {n} lot{n !== 1 ? 's' : ''}</div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'high', label: '🔴 High', count: byRisk.high.length, color: 'bg-red-950 border-red-800 text-red-300' },
            { key: 'moderate', label: '🟡 Moderate', count: byRisk.moderate.length, color: 'bg-amber-950 border-amber-800 text-amber-300' },
            { key: 'low', label: '🟢 Low', count: byRisk.low.length, color: 'bg-green-950 border-green-800 text-green-300' },
            { key: 'loss', label: '📉 Loss', count: byRisk.loss.length, color: 'bg-slate-800 border-slate-600 text-slate-400' },
            { key: 'ltcg', label: '✓ LTCG', count: byRisk.ltcg.length, color: 'bg-indigo-950 border-indigo-800 text-indigo-300' },
          ].filter(r => r.count > 0).map(r => (
            <span key={r.key} className={`text-xs border rounded-full px-2.5 py-1 ${r.color}`}>
              {r.label} · {r.count} ({Math.round((r.count / n) * 100)}%)
            </span>
          ))}
        </div>
        {/* Visual progress bar */}
        <div className="flex rounded-full overflow-hidden h-1.5 mt-2 gap-px">
          {[
            { count: byRisk.high.length, color: 'bg-red-500' },
            { count: byRisk.moderate.length, color: 'bg-amber-400' },
            { count: byRisk.low.length, color: 'bg-green-400' },
            { count: byRisk.loss.length, color: 'bg-slate-600' },
            { count: byRisk.ltcg.length, color: 'bg-indigo-500' },
          ].filter(s => s.count > 0).map((s, i) => (
            <div
              key={i}
              className={`${s.color} transition-all`}
              style={{ width: `${(s.count / n) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* ── Scatter chart ── */}
      <div>
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-xs font-semibold text-slate-300">Portfolio Tax Map</div>
            <div className="text-xs text-slate-500 mt-0.5">
              X = days until LTCG · Y = tax savings by waiting · size = position value · hover for details
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 justify-end">
            {[['#f87171', 'High'], ['#fbbf24', 'Moderate'], ['#4ade80', 'Low'], ['#64748b', 'Loss/LTCG']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 10, right: 15, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="x"
              type="number"
              name="Days until LTCG"
              domain={[0, 366]}
              ticks={[0, 60, 120, 180, 240, 300, 366]}
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              label={{ value: 'Days until LTCG', position: 'insideBottom', offset: -12, fill: '#475569', fontSize: 10 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              name="Tax savings"
              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={48}
              label={{ value: 'Tax savings', angle: -90, position: 'insideLeft', offset: 14, fill: '#475569', fontSize: 10 }}
            />
            <ZAxis dataKey="z" range={[60, 800]} />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} />
            <ReferenceLine x={90} stroke="#334155" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: '90d', fill: '#475569', fontSize: 8, position: 'top' }} />
            <ReferenceLine x={180} stroke="#334155" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: '180d', fill: '#475569', fontSize: 8, position: 'top' }} />
            <Scatter data={scatterData} fillOpacity={0.75}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={RISK_COLOR[d.risk] ?? '#64748b'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="text-xs text-slate-600 -mt-1">
          Top-left = high savings + close deadline (most urgent) · Top-right = high savings + time to wait
        </div>
      </div>

      {/* ── Tax-loss harvesting summary ── */}
      {totalLosses > 0 && (
        <div className="border-t border-slate-700/40 pt-4">
          <div className="text-xs font-semibold text-slate-300 mb-3">Tax-Loss Harvesting Opportunity</div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Total Unrealized Losses</div>
              <div className="font-mono font-bold text-base text-red-400">
                -{formatCurrency(totalLosses)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Offsets Against Gains</div>
              <div className="font-mono font-bold text-base text-white">
                {formatCurrency(Math.min(totalLosses, totalGainsOnly))}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {netGainAfterHarvesting > 0
                  ? `${formatCurrency(netGainAfterHarvesting)} remaining gain`
                  : 'fully offsets gains'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Est. Tax Saved</div>
              <div className="font-mono font-bold text-base text-green-400">
                {formatCurrency(taxSavedByHarvesting)}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            <span className="text-amber-500/80">⚠️ Wash-sale rule:</span> repurchasing the same security within 30 days before or after the sale disallows the loss deduction.
          </p>
        </div>
      )}
    </div>
  )
}

function StatItem({ label, value, positive, negative, sublabel }: {
  label: string; value: string; positive?: boolean; negative?: boolean; sublabel?: string
}) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className={`font-mono font-bold text-base ${positive ? 'text-green-400' : negative ? 'text-red-400' : 'text-white'}`}>
        {value}
      </div>
      {sublabel && <div className="text-xs text-slate-600 mt-0.5">{sublabel}</div>}
    </div>
  )
}
