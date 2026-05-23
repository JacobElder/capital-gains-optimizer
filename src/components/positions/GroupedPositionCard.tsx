import { useState } from 'react'
import type { PositionAnalysis } from '../../types'
import { formatCurrency } from '../../lib/taxEngine'
import PositionCard from './PositionCard'

interface Props {
  ticker: string
  analyses: PositionAnalysis[]
  onEdit: (id: string) => void
}

export default function GroupedPositionCard({ ticker, analyses, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)

  const totalValue = analyses.reduce((s, a) => s + a.currentValue, 0)
  const totalGain = analyses.reduce((s, a) => s + a.gainAmount, 0)
  const totalSavings = analyses.filter(a => !a.isLoss && !a.isLongTerm).reduce((s, a) => s + a.taxSavingsFromWaiting, 0)
  const isLoss = totalGain < 0
  const companyName = analyses[0]?.position.name ?? ticker

  // Risk distribution
  const riskCounts: Record<string, number> = {}
  for (const a of analyses) {
    riskCounts[a.riskLevel] = (riskCounts[a.riskLevel] ?? 0) + 1
  }

  // Most urgent lot: smallest daysUntilLongTerm among non-LTCG, non-loss
  const actionable = analyses.filter(a => !a.isLongTerm && !a.isLoss)
  const mostUrgent = actionable.length > 0
    ? actionable.reduce((min, a) => a.daysUntilLongTerm < min.daysUntilLongTerm ? a : min)
    : null

  const RISK_BADGE_STYLES: Record<string, string> = {
    high: 'bg-red-950 border-red-800 text-red-300',
    moderate: 'bg-amber-950 border-amber-800 text-amber-300',
    low: 'bg-green-950 border-green-800 text-green-300',
    loss: 'bg-slate-800 border-slate-600 text-slate-400',
    'already-ltcg': 'bg-indigo-950 border-indigo-800 text-indigo-300',
    'stcg-preferred': 'bg-orange-950 border-orange-800 text-orange-300',
  }
  const RISK_ICONS: Record<string, string> = {
    high: '🔴', moderate: '🟡', low: '🟢', loss: '📉', 'already-ltcg': '✅', 'stcg-preferred': '⚠️',
  }

  // Dominant risk level (for border coloring)
  const dominantRisk = Object.entries(riskCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'low'

  return (
    <div className={`bg-slate-800 border rounded-xl overflow-hidden transition-all
      ${dominantRisk === 'high' ? 'border-red-900/70' :
        dominantRisk === 'low' ? 'border-green-900/60' :
        dominantRisk === 'already-ltcg' ? 'border-blue-900/60' :
        'border-slate-700/50'}`}>

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0
            ${isLoss ? 'bg-red-900/50 text-red-300' : 'bg-indigo-900/50 text-indigo-300'}`}>
            {ticker.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-base">{ticker}</span>
              <span className="text-slate-400 text-sm truncate">{companyName}</span>
              <span className="text-xs bg-slate-700 text-slate-400 rounded-full px-2 py-0.5">
                {analyses.length} lot{analyses.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-500 font-mono">{formatCurrency(totalValue)}</span>
              <span className={`text-xs font-mono font-semibold ${isLoss ? 'text-red-400' : 'text-green-400'}`}>
                {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} gain
              </span>
              {totalSavings > 0 && (
                <span className="text-xs text-indigo-300 font-mono">
                  {formatCurrency(totalSavings)} potential savings
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Risk distribution badges */}
          <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-[200px]">
            {Object.entries(riskCounts).map(([risk, count]) => (
              <span
                key={risk}
                className={`text-xs border rounded-full px-2 py-0.5 ${RISK_BADGE_STYLES[risk] ?? ''}`}
              >
                {RISK_ICONS[risk]} {count}
              </span>
            ))}
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-slate-400 hover:text-white transition-colors text-xs bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 rounded-lg"
          >
            {expanded ? '▲ Collapse' : '▼ Expand'}
          </button>
        </div>
      </div>

      {/* Next LTCG callout */}
      {mostUrgent && (
        <div className="px-5 pb-3">
          <span className="text-xs text-slate-500">
            Next LTCG: <span className="text-indigo-300 font-semibold">{mostUrgent.daysUntilLongTerm} day{mostUrgent.daysUntilLongTerm !== 1 ? 's' : ''}</span>
            {analyses.length > 1 && ` · most urgent of ${analyses.length} lots`}
          </span>
        </div>
      )}

      {/* Expanded individual cards */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-4 space-y-4 bg-slate-900/30">
          {analyses.map(a => (
            <PositionCard
              key={a.position.id}
              position={a.position}
              onEdit={() => onEdit(a.position.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
