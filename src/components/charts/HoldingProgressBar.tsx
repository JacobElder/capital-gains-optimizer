interface Props {
  daysHeld: number
  daysUntilLongTerm: number
  isLongTerm: boolean
  progressPercent: number
  longTermDate: string
}

export default function HoldingProgressBar({ daysHeld, daysUntilLongTerm, isLongTerm, progressPercent, longTermDate }: Props) {
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
          ? <span className="text-green-700 font-semibold">✓ Long-term since {longTermDate}</span>
          : <span>{daysUntilLongTerm} day{daysUntilLongTerm !== 1 ? 's' : ''} until LTCG · sell on or after {longTermDate}</span>
        }
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>Purchase date</span>
        <span>1-year LTCG</span>
      </div>
    </div>
  )
}
