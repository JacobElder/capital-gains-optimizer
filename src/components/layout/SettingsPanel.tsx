import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { SORTED_STATES, STATE_TAX_DATA } from '../../data/stateTaxData'
import type { FilingStatus } from '../../types'

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
  mfs: 'Married Filing Separately',
  hoh: 'Head of Household',
}

export default function SettingsPanel() {
  const { settings, setSettings } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)
  const [incomeStr, setIncomeStr] = useState(settings.annualTaxableIncome.toLocaleString())

  const currentState = STATE_TAX_DATA[settings.stateCode]

  function handleIncomeBlur() {
    const parsed = parseInt(incomeStr.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(parsed) && parsed >= 0) {
      setSettings({ annualTaxableIncome: parsed })
      setIncomeStr(parsed.toLocaleString())
    }
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400">⚙️</span>
          <span className="text-sm font-semibold text-slate-200">Tax Settings</span>
          {collapsed && (
            <span className="text-xs text-slate-500 ml-2">
              {FILING_STATUS_LABELS[settings.filingStatus]} · ${settings.annualTaxableIncome.toLocaleString()} · {currentState?.name ?? settings.stateCode}
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs">{collapsed ? '▼ Expand' : '▲ Collapse'}</span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Filing status */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Filing Status</label>
            <select
              value={settings.filingStatus}
              onChange={e => setSettings({ filingStatus: e.target.value as FilingStatus })}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Annual income */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">
              Annual Taxable Income
              <span className="text-slate-600 ml-1">(after deductions)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="text"
                value={incomeStr}
                onChange={e => setIncomeStr(e.target.value)}
                onBlur={handleIncomeBlur}
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder="150,000"
              />
            </div>
          </div>

          {/* State */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">State</label>
            <select
              value={settings.stateCode}
              onChange={e => {
                setSettings({ stateCode: e.target.value })
                if (e.target.value !== 'NY') setSettings({ nycResident: false })
              }}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SORTED_STATES.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
            {currentState?.notes && (
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{currentState.notes}</p>
            )}
            {settings.stateCode === 'NY' && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={settings.nycResident ?? false}
                  onChange={e => setSettings({ nycResident: e.target.checked })}
                  className="w-3.5 h-3.5 rounded accent-indigo-500"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                  NYC resident <span className="text-slate-600">(adds ~3.876%)</span>
                </span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="px-5 pb-3 text-xs text-slate-600 border-t border-slate-700/50 pt-3">
        ⚠️ Tax calculations are estimates for planning purposes only. Consult a qualified tax professional before making investment decisions.
      </div>
    </div>
  )
}
