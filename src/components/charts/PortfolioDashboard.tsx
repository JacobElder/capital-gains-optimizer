import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import type { PositionAnalysis, RiskLevel } from '../../types'
import { formatCurrency } from '../../lib/taxEngine'
import { RISK_LEVELS, chanceWaitingWins, summarizePortfolio } from '../../lib/portfolioSummary'

const RISK_COLOR: Record<RiskLevel, string> = {
  high: '#ef4444',
  moderate: '#f59e0b',
  low: '#22c55e',
  loss: '#94a3b8',
  'already-ltcg': '#3b82f6',
  'stcg-preferred': '#f97316',
  invalid: '#64748b',
}

const RISK_CHIP: Record<RiskLevel, { label: string; chip: string; bar: string }> = {
  high: { label: 'High Risk', chip: 'bg-red-50 border-red-200 text-red-700', bar: 'bg-red-400' },
  'stcg-preferred': { label: 'Sell Short-Term', chip: 'bg-orange-50 border-orange-200 text-orange-700', bar: 'bg-orange-400' },
  moderate: { label: 'Moderate', chip: 'bg-amber-50 border-amber-200 text-amber-700', bar: 'bg-amber-400' },
  low: { label: 'Low Risk', chip: 'bg-green-50 border-green-200 text-green-700', bar: 'bg-green-500' },
  'already-ltcg': { label: 'LTCG ✓', chip: 'bg-blue-50 border-blue-200 text-blue-700', bar: 'bg-blue-400' },
  loss: { label: 'Loss', chip: 'bg-slate-100 border-slate-300 text-slate-600', bar: 'bg-slate-300' },
  invalid: { label: 'Check Data', chip: 'bg-slate-50 border-slate-300 text-slate-500', bar: 'bg-slate-500' },
}

const SCATTER_LEGEND: Array<[RiskLevel, string]> = [
  ['high', 'High'], ['moderate', 'Moderate'], ['low', 'Low'], ['stcg-preferred', 'Sell ST'], ['loss', 'Loss'],
]

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs shadow-lg min-w-[160px]">
      <div className="font-bold text-slate-900 text-sm mb-1.5">{d.ticker}</div>
      <div className="space-y-0.5 text-slate-600">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Value</span>
          <span className="font-mono">{formatCurrency(d.value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Gain</span>
          <span className={`font-mono ${d.gain >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {d.gain >= 0 ? '+' : ''}{formatCurrency(d.gain)}
          </span>
        </div>
        {d.savings > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Tax savings</span>
            <span className="font-mono text-[#1B6B3A] font-semibold">{formatCurrency(d.savings)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Days left</span>
          <span className="font-mono">{d.daysUntil === 0 ? 'LTCG ✓' : d.daysUntil}</span>
        </div>
        {d.prob != null && (
          <div className="flex justify-between gap-4 pt-1 border-t border-slate-100 mt-1">
            <span className="text-slate-400">P(waiting wins)</span>
            <span className="font-mono font-semibold text-slate-900">
              {(d.prob * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ScatterPoint {
  x: number
  y: number
  z: number
  ticker: string
  risk: RiskLevel
  value: number
  gain: number
  savings: number
  daysUntil: number
  prob: number | null
}

interface Props {
  analyses: PositionAnalysis[]
}

export default function PortfolioDashboard({ analyses }: Props) {
  const summary = useMemo(() => summarizePortfolio(analyses), [analyses])
  const { totalValue, totalGain, totalSavings, weightedProbability, expectedShortfall, riskCounts, longTermCount } = summary
  const { totalLosses, offset, netGainAfterHarvesting, taxSaved: taxSavedByHarvesting } = summary.harvesting

  // Long-term and invalid lots have no decision left (and would all pile up at day 0)
  const scatterData: ScatterPoint[] = useMemo(() => analyses
    .filter(a => !a.isLongTerm && a.riskLevel !== 'invalid')
    .map(a => ({
      x: a.daysUntilLongTerm,
      y: Math.max(0, a.taxSavingsFromWaiting),
      z: Math.max(a.currentValue, 500),
      ticker: a.position.ticker,
      risk: a.riskLevel,
      value: a.currentValue,
      gain: a.gainAmount,
      savings: a.taxSavingsFromWaiting,
      daysUntil: a.daysUntilLongTerm,
      prob: chanceWaitingWins(a),
    })), [analyses])

  const n = analyses.length

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 mb-4 space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 pb-5 border-b border-slate-100">
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
          sublabel={`if prices hold · expected shortfall ${formatCurrency(expectedShortfall)}`}
        />
        <div>
          <div className="text-xs text-slate-400 mb-1 font-medium">Chance of Capturing Savings</div>
          {weightedProbability != null ? (
            <div>
              {/* Neutral on purpose: a 50–60% chance is normal and still worth it on average;
                  the risk rating, not this number, says whether waiting is a good bet */}
              <div className="font-mono font-bold text-xl text-slate-900">
                {(weightedProbability * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5">savings-weighted chance each lot ends above break-even</div>
            </div>
          ) : (
            <div className="text-slate-400 text-sm">—</div>
          )}
        </div>
      </div>

      {/* Risk distribution */}
      <div>
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Risk Distribution — {n} lot{n !== 1 ? 's' : ''}</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {RISK_LEVELS.filter(r => riskCounts[r] > 0).map(r => (
            <span key={r} className={`text-xs border rounded px-2.5 py-1 font-medium ${RISK_CHIP[r].chip}`}>
              {RISK_CHIP[r].label} · {riskCounts[r]} ({Math.round((riskCounts[r] / n) * 100)}%)
            </span>
          ))}
        </div>
        <div className="flex rounded overflow-hidden h-2 gap-px bg-slate-100">
          {RISK_LEVELS.filter(r => riskCounts[r] > 0).map(r => (
            <div
              key={r}
              className={`${RISK_CHIP[r].bar} transition-all`}
              style={{ width: `${(riskCounts[r] / n) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Scatter chart */}
      <div>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-slate-700">Portfolio Tax Map</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Short-term lots · X = days until LTCG · Y = tax savings · size = position value · hover for details
              {longTermCount > 0 && ` · ${longTermCount} long-term lot${longTermCount !== 1 ? 's' : ''} not shown`}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 justify-end">
            {SCATTER_LEGEND.map(([r, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: RISK_COLOR[r] }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 10, right: 15, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="x"
              type="number"
              name="Days until LTCG"
              domain={[0, 366]}
              padding={{ left: 16, right: 16 }}
              ticks={[0, 60, 120, 180, 240, 300, 366]}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              label={{ value: 'Days until LTCG', position: 'insideBottom', offset: -12, fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              name="Tax savings"
              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={48}
              label={{ value: 'Tax savings', angle: -90, position: 'insideLeft', offset: 14, fill: '#94a3b8', fontSize: 10 }}
            />
            <ZAxis dataKey="z" range={[60, 800]} />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} />
            <ReferenceLine x={90} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: '90d', fill: '#94a3b8', fontSize: 8, position: 'top' }} />
            <ReferenceLine x={180} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: '180d', fill: '#94a3b8', fontSize: 8, position: 'top' }} />
            <Scatter data={scatterData} fillOpacity={0.8}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={RISK_COLOR[d.risk]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="text-xs text-slate-400 -mt-1">
          Top-left = high savings, deadline close (little time for the price to move) · Top-right = high savings, long wait (most exposure)
        </div>
      </div>

      {/* Tax-loss harvesting */}
      {totalLosses > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">Tax-Loss Harvesting Opportunity</div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Total Unrealized Losses</div>
              <div className="font-mono font-bold text-lg text-red-600">
                -{formatCurrency(totalLosses)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Offsets Against Gains</div>
              <div className="font-mono font-bold text-lg text-slate-900">
                {formatCurrency(offset)}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {netGainAfterHarvesting > 0
                  ? `${formatCurrency(netGainAfterHarvesting)} remaining gain`
                  : 'fully offsets gains'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Est. Tax Saved</div>
              <div className="font-mono font-bold text-lg text-green-700">
                {taxSavedByHarvesting.low === taxSavedByHarvesting.high
                  ? formatCurrency(taxSavedByHarvesting.high)
                  : `${formatCurrency(taxSavedByHarvesting.low)}–${formatCurrency(taxSavedByHarvesting.high)}`}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">only if those gains are realized this year</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <span className="text-amber-700 font-semibold">⚠️ Wash-sale rule:</span> repurchasing the same security within 30 days before or after the sale disallows the loss deduction.
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
      <div className="text-xs text-slate-400 mb-0.5 font-medium">{label}</div>
      <div className={`font-mono font-bold text-xl ${positive ? 'text-green-700' : negative ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </div>
      {sublabel && <div className="text-xs text-slate-400 mt-0.5">{sublabel}</div>}
    </div>
  )
}
