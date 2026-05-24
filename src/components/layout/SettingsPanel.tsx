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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold text-slate-700">Tax Settings</span>
          {collapsed && (
            <span className="text-xs text-slate-400 ml-1">
              {FILING_STATUS_LABELS[settings.filingStatus]} · ${settings.annualTaxableIncome.toLocaleString()} · {currentState?.name ?? settings.stateCode}
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Filing Status</label>
            <select
              value={settings.filingStatus}
              onChange={e => setSettings({ filingStatus: e.target.value as FilingStatus })}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B3A] focus:border-transparent"
            >
              {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">
              Annual Taxable Income
              <span className="text-slate-400 ml-1">(after deductions)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="text"
                value={incomeStr}
                onChange={e => setIncomeStr(e.target.value)}
                onBlur={handleIncomeBlur}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B3A] focus:border-transparent font-mono"
                placeholder="150,000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">State</label>
            <select
              value={settings.stateCode}
              onChange={e => {
                setSettings({ stateCode: e.target.value })
                if (e.target.value !== 'NY') setSettings({ nycResident: false })
              }}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B3A] focus:border-transparent"
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
                  className="w-3.5 h-3.5 rounded accent-[#1B6B3A]"
                />
                <span className="text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
                  NYC resident <span className="text-slate-400">(adds ~3.876%)</span>
                </span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100 bg-slate-50">
        ⚠️ Estimates for planning purposes only. Consult a qualified tax professional before making investment decisions.
      </div>
    </div>
  )
}
