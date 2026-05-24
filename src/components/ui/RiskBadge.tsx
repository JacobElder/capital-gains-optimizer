import type { RiskLevel } from '../../types'

interface Props {
  riskLevel: RiskLevel
  dropCushionPercent?: number
  large?: boolean
}

const CONFIG: Record<RiskLevel, { label: string; icon: string; classes: string }> = {
  high: {
    label: 'HIGH RISK',
    icon: '▲',
    classes: 'bg-red-50 border border-red-200 text-red-700',
  },
  moderate: {
    label: 'MODERATE',
    icon: '●',
    classes: 'bg-amber-50 border border-amber-200 text-amber-700',
  },
  low: {
    label: 'LOW RISK',
    icon: '●',
    classes: 'bg-green-50 border border-green-200 text-green-700',
  },
  'already-ltcg': {
    label: 'LONG-TERM',
    icon: '✓',
    classes: 'bg-blue-50 border border-blue-200 text-blue-700',
  },
  loss: {
    label: 'UNREALIZED LOSS',
    icon: '▼',
    classes: 'bg-slate-100 border border-slate-300 text-slate-600',
  },
  'stcg-preferred': {
    label: 'SELL BEFORE LTCG',
    icon: '!',
    classes: 'bg-orange-50 border border-orange-200 text-orange-700',
  },
}

export default function RiskBadge({ riskLevel, dropCushionPercent, large }: Props) {
  const cfg = CONFIG[riskLevel]
  return (
    <span className={`inline-flex items-center gap-1 rounded font-semibold tracking-wide
      ${large ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'} ${cfg.classes}`}>
      <span className="text-[10px] font-black">{cfg.icon}</span>
      {cfg.label}
      {dropCushionPercent !== undefined && riskLevel !== 'high' && riskLevel !== 'already-ltcg'
        && riskLevel !== 'loss' && riskLevel !== 'stcg-preferred'
        && (
        <span className="opacity-60 font-normal">
          ({dropCushionPercent.toFixed(1)}% cushion)
        </span>
      )}
    </span>
  )
}
