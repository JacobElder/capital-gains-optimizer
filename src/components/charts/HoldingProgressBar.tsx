interface Props {
  daysHeld: number
  daysUntilLongTerm: number
  isLongTerm: boolean
  progressPercent: number
}

export default function HoldingProgressBar({ daysHeld, daysUntilLongTerm, isLongTerm, progressPercent }: Props) {
  const barColor = isLongTerm
    ? 'bg-green-500'
    : progressPercent >= 67
    ? 'bg-emerald-400'
    : progressPercent >= 34
    ? 'bg-amber-400'
    : 'bg-red-500'

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{daysHeld} days held</span>
        {isLongTerm
          ? <span className="text-green-400 font-semibold">✓ Long-term achieved</span>
          : <span>{daysUntilLongTerm} days until LTCG</span>
        }
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>Purchase date</span>
        <span>1-year LTCG</span>
      </div>
    </div>
  )
}
