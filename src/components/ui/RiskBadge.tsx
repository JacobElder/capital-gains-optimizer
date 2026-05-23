import type { RiskLevel } from '../../types'

interface Props {
  riskLevel: RiskLevel
  dropCushionPercent?: number
  large?: boolean
}

const CONFIG: Record<RiskLevel, { label: string; icon: string; classes: string; iconClasses: string }> = {
  high: {
    label: 'HIGH RISK',
    icon: '🔴',
    classes: 'bg-red-950 border border-red-700 text-red-300',
    iconClasses: 'text-red-400',
  },
  moderate: {
    label: 'MODERATE',
    icon: '🟡',
    classes: 'bg-amber-950 border border-amber-700 text-amber-300',
    iconClasses: 'text-amber-400',
  },
  low: {
    label: 'LOW RISK',
    icon: '🟢',
    classes: 'bg-green-950 border border-green-700 text-green-300',
    iconClasses: 'text-green-400',
  },
  'already-ltcg': {
    label: 'LONG-TERM',
    icon: '✅',
    classes: 'bg-blue-950 border border-blue-700 text-blue-300',
    iconClasses: 'text-blue-400',
  },
  loss: {
    label: 'UNREALIZED LOSS',
    icon: '📉',
    classes: 'bg-slate-800 border border-slate-600 text-slate-400',
    iconClasses: 'text-slate-400',
  },
  'stcg-preferred': {
    label: 'SELL BEFORE LTCG',
    icon: '⚠️',
    classes: 'bg-orange-950 border border-orange-700 text-orange-300',
    iconClasses: 'text-orange-400',
  },
}

export default function RiskBadge({ riskLevel, dropCushionPercent, large }: Props) {
  const cfg = CONFIG[riskLevel]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide
      ${large ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} ${cfg.classes}`}>
      <span className={large ? 'text-base' : 'text-sm'}>{cfg.icon}</span>
      {cfg.label}
      {dropCushionPercent !== undefined && riskLevel !== 'high' && riskLevel !== 'already-ltcg'
        && riskLevel !== 'loss' && riskLevel !== 'stcg-preferred'
        && (
        <span className="opacity-70 font-normal">
          ({dropCushionPercent.toFixed(1)}% cushion)
        </span>
      )}
    </span>
  )
}
