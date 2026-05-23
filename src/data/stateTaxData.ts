import type { StateTaxInfo, FilingStatus } from '../types'

// 2025 state capital gains tax data
// For states with brackets, rate shown is top marginal rate used for display;
// actual rate is bracket-looked-up in the tax engine.
export const STATE_TAX_DATA: Record<string, StateTaxInfo> = {
  AL: {
    code: 'AL', name: 'Alabama',
    stcgRate: 0.05, ltcgRate: 0.05,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5% on income over $3,001 (single)',
  },
  AK: {
    code: 'AK', name: 'Alaska',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  AZ: {
    code: 'AZ', name: 'Arizona',
    stcgRate: 0.025, ltcgRate: 0.025,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '2.5% flat rate',
  },
  AR: {
    code: 'AR', name: 'Arkansas',
    stcgRate: 0.039, ltcgRate: 0.039,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: '3.9% top rate (2025)',
  },
  CA: {
    code: 'CA', name: 'California',
    stcgRate: 0.133, ltcgRate: 0.133,
    treatsCGAsOrdinaryIncome: true, hasBrackets: true,
    brackets: {
      single: [
        { upTo: 10756, rate: 0.01 },
        { upTo: 25499, rate: 0.02 },
        { upTo: 40245, rate: 0.04 },
        { upTo: 55866, rate: 0.06 },
        { upTo: 70606, rate: 0.08 },
        { upTo: 360659, rate: 0.093 },
        { upTo: 432787, rate: 0.103 },
        { upTo: 721314, rate: 0.113 },
        { upTo: 1000000, rate: 0.123 },
        { upTo: Infinity, rate: 0.133 },
      ],
      mfj: [
        { upTo: 21512, rate: 0.01 },
        { upTo: 50998, rate: 0.02 },
        { upTo: 80490, rate: 0.04 },
        { upTo: 111732, rate: 0.06 },
        { upTo: 141212, rate: 0.08 },
        { upTo: 721318, rate: 0.093 },
        { upTo: 865574, rate: 0.103 },
        { upTo: 1000000, rate: 0.113 },
        { upTo: 1442628, rate: 0.123 },
        { upTo: Infinity, rate: 0.133 },
      ],
    },
    notes: 'CA taxes CG as ordinary income. Top rate 13.3% includes 1% Mental Health surcharge.',
  },
  CO: {
    code: 'CO', name: 'Colorado',
    stcgRate: 0.044, ltcgRate: 0.044,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.4% flat rate',
  },
  CT: {
    code: 'CT', name: 'Connecticut',
    stcgRate: 0.0699, ltcgRate: 0.0699,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 6.99% on income over $500K (single)',
  },
  DE: {
    code: 'DE', name: 'Delaware',
    stcgRate: 0.066, ltcgRate: 0.066,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 6.6% on income over $60,001',
  },
  FL: {
    code: 'FL', name: 'Florida',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  GA: {
    code: 'GA', name: 'Georgia',
    stcgRate: 0.0549, ltcgRate: 0.0549,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '5.49% flat rate (2024); further reductions planned',
  },
  HI: {
    code: 'HI', name: 'Hawaii',
    stcgRate: 0.11, ltcgRate: 0.0725,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'STCG taxed as ordinary income (up to 11%). LTCG capped at 7.25%.',
  },
  ID: {
    code: 'ID', name: 'Idaho',
    stcgRate: 0.058, ltcgRate: 0.058,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '5.8% flat rate',
  },
  IL: {
    code: 'IL', name: 'Illinois',
    stcgRate: 0.0495, ltcgRate: 0.0495,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.95% flat rate',
  },
  IN: {
    code: 'IN', name: 'Indiana',
    stcgRate: 0.0305, ltcgRate: 0.0305,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '3.05% flat rate (2024)',
  },
  IA: {
    code: 'IA', name: 'Iowa',
    stcgRate: 0.038, ltcgRate: 0.038,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '3.8% flat rate (2025, post-reform)',
  },
  KS: {
    code: 'KS', name: 'Kansas',
    stcgRate: 0.057, ltcgRate: 0.057,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.7% on income over $30K (single)',
  },
  KY: {
    code: 'KY', name: 'Kentucky',
    stcgRate: 0.04, ltcgRate: 0.04,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.0% flat rate (reduced from 4.5%)',
  },
  LA: {
    code: 'LA', name: 'Louisiana',
    stcgRate: 0.03, ltcgRate: 0.03,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '3% flat rate (effective Jan 1, 2025)',
  },
  ME: {
    code: 'ME', name: 'Maine',
    stcgRate: 0.0715, ltcgRate: 0.0715,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 7.15%',
  },
  MD: {
    code: 'MD', name: 'Maryland',
    stcgRate: 0.0575, ltcgRate: 0.0575,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'State rate 5.75%. Local/county tax adds ~2–3% (not included here).',
  },
  MA: {
    code: 'MA', name: 'Massachusetts',
    stcgRate: 0.085, ltcgRate: 0.05,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'MA taxes STCG at 8.5% and LTCG at 5.0% — lower state rate for waiting.',
  },
  MI: {
    code: 'MI', name: 'Michigan',
    stcgRate: 0.0425, ltcgRate: 0.0425,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.25% flat rate',
  },
  MN: {
    code: 'MN', name: 'Minnesota',
    stcgRate: 0.0985, ltcgRate: 0.0985,
    treatsCGAsOrdinaryIncome: true, hasBrackets: true,
    brackets: {
      single: [
        { upTo: 31690, rate: 0.0535 },
        { upTo: 104090, rate: 0.068 },
        { upTo: 193240, rate: 0.0785 },
        { upTo: Infinity, rate: 0.0985 },
      ],
      mfj: [
        { upTo: 46330, rate: 0.0535 },
        { upTo: 184040, rate: 0.068 },
        { upTo: 321450, rate: 0.0785 },
        { upTo: Infinity, rate: 0.0985 },
      ],
    },
    notes: 'Top rate 9.85%',
  },
  MS: {
    code: 'MS', name: 'Mississippi',
    stcgRate: 0.047, ltcgRate: 0.047,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.7% flat rate (reducing to 4.4% by 2026)',
  },
  MO: {
    code: 'MO', name: 'Missouri',
    stcgRate: 0.047, ltcgRate: 0.047,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 4.7% (effectively flat for most earners)',
  },
  MT: {
    code: 'MT', name: 'Montana',
    stcgRate: 0.059, ltcgRate: 0.059,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.9%. Small CG deduction may apply.',
  },
  NE: {
    code: 'NE', name: 'Nebraska',
    stcgRate: 0.0584, ltcgRate: 0.0584,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.84% (reducing to 3.99% by 2027)',
  },
  NV: {
    code: 'NV', name: 'Nevada',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  NH: {
    code: 'NH', name: 'New Hampshire',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No capital gains tax (I&D tax eliminated Jan 1, 2025)',
  },
  NJ: {
    code: 'NJ', name: 'New Jersey',
    stcgRate: 0.1075, ltcgRate: 0.1075,
    treatsCGAsOrdinaryIncome: true, hasBrackets: true,
    brackets: {
      single: [
        { upTo: 20000, rate: 0.014 },
        { upTo: 35000, rate: 0.0175 },
        { upTo: 40000, rate: 0.035 },
        { upTo: 75000, rate: 0.05525 },
        { upTo: 500000, rate: 0.0637 },
        { upTo: 1000000, rate: 0.0897 },
        { upTo: Infinity, rate: 0.1075 },
      ],
      mfj: [
        { upTo: 20000, rate: 0.014 },
        { upTo: 50000, rate: 0.0175 },
        { upTo: 70000, rate: 0.0245 },
        { upTo: 80000, rate: 0.035 },
        { upTo: 150000, rate: 0.05525 },
        { upTo: 500000, rate: 0.0637 },
        { upTo: 1000000, rate: 0.0897 },
        { upTo: Infinity, rate: 0.1075 },
      ],
    },
    notes: 'Top rate 10.75% on income over $1M',
  },
  NM: {
    code: 'NM', name: 'New Mexico',
    stcgRate: 0.059, ltcgRate: 0.059,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.9%',
  },
  NY: {
    code: 'NY', name: 'New York',
    stcgRate: 0.109, ltcgRate: 0.109,
    treatsCGAsOrdinaryIncome: true, hasBrackets: true,
    brackets: {
      single: [
        { upTo: 8500, rate: 0.04 },
        { upTo: 11700, rate: 0.045 },
        { upTo: 13900, rate: 0.0525 },
        { upTo: 80650, rate: 0.0585 },
        { upTo: 215400, rate: 0.0625 },
        { upTo: 1077550, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: Infinity, rate: 0.109 },
      ],
      mfj: [
        { upTo: 17150, rate: 0.04 },
        { upTo: 23600, rate: 0.045 },
        { upTo: 27900, rate: 0.0525 },
        { upTo: 161550, rate: 0.0585 },
        { upTo: 323200, rate: 0.0625 },
        { upTo: 2155350, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: Infinity, rate: 0.109 },
      ],
    },
    notes: 'NYC residents add up to 3.876% city income tax (not included).',
  },
  NC: {
    code: 'NC', name: 'North Carolina',
    stcgRate: 0.0425, ltcgRate: 0.0425,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.25% flat rate (2025)',
  },
  ND: {
    code: 'ND', name: 'North Dakota',
    stcgRate: 0.025, ltcgRate: 0.025,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 2.5%',
  },
  OH: {
    code: 'OH', name: 'Ohio',
    stcgRate: 0.035, ltcgRate: 0.035,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 3.5% on income over $100K',
  },
  OK: {
    code: 'OK', name: 'Oklahoma',
    stcgRate: 0.0475, ltcgRate: 0.0475,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 4.75%',
  },
  OR: {
    code: 'OR', name: 'Oregon',
    stcgRate: 0.099, ltcgRate: 0.099,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 9.9% on income over $125K (single)',
  },
  PA: {
    code: 'PA', name: 'Pennsylvania',
    stcgRate: 0.0307, ltcgRate: 0.0307,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '3.07% flat rate',
  },
  RI: {
    code: 'RI', name: 'Rhode Island',
    stcgRate: 0.0599, ltcgRate: 0.0599,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.99%',
  },
  SC: {
    code: 'SC', name: 'South Carolina',
    stcgRate: 0.062, ltcgRate: 0.03472,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'STCG at 6.2%. LTCG benefits from 44% exclusion → effective 3.47%.',
  },
  SD: {
    code: 'SD', name: 'South Dakota',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  TN: {
    code: 'TN', name: 'Tennessee',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  TX: {
    code: 'TX', name: 'Texas',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  UT: {
    code: 'UT', name: 'Utah',
    stcgRate: 0.0455, ltcgRate: 0.0455,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: '4.55% flat rate',
  },
  VT: {
    code: 'VT', name: 'Vermont',
    stcgRate: 0.0875, ltcgRate: 0.0875,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 8.75%',
  },
  VA: {
    code: 'VA', name: 'Virginia',
    stcgRate: 0.0575, ltcgRate: 0.0575,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.75% (on income over $17,001)',
  },
  WA: {
    code: 'WA', name: 'Washington',
    stcgRate: 0, ltcgRate: 0.07,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No income tax on STCG. LTCG over $262K threshold taxed at 7%. Unique: STCG may be preferred for large gains.',
  },
  WV: {
    code: 'WV', name: 'West Virginia',
    stcgRate: 0.0512, ltcgRate: 0.0512,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 5.12%',
  },
  WI: {
    code: 'WI', name: 'Wisconsin',
    stcgRate: 0.0765, ltcgRate: 0.05355,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'STCG at top rate 7.65%. LTCG benefits from 30% exclusion → effective 5.355%.',
  },
  WY: {
    code: 'WY', name: 'Wyoming',
    stcgRate: 0, ltcgRate: 0,
    treatsCGAsOrdinaryIncome: false, hasBrackets: false,
    notes: 'No state income tax',
  },
  DC: {
    code: 'DC', name: 'District of Columbia',
    stcgRate: 0.1075, ltcgRate: 0.1075,
    treatsCGAsOrdinaryIncome: true, hasBrackets: false,
    notes: 'Top rate 10.75% on income over $1M',
  },
}

export function getStateSTCGRate(stateCode: string, income: number, status: FilingStatus): number {
  const state = STATE_TAX_DATA[stateCode]
  if (!state) return 0
  if (!state.hasBrackets || !state.brackets) return state.stcgRate

  const brackets = status === 'mfj' ? state.brackets.mfj : state.brackets.single
  return brackets.find(b => income <= b.upTo)?.rate ?? state.stcgRate
}

export function getStateLTCGRate(stateCode: string, income: number, status: FilingStatus): number {
  const state = STATE_TAX_DATA[stateCode]
  if (!state) return 0
  // For states with different STCG/LTCG rates (MA, WA, SC, WI, HI), ltcgRate is already set correctly
  if (!state.hasBrackets || !state.brackets) return state.ltcgRate

  // Bracketed states tax CG as ordinary income — same rate for both STCG and LTCG
  const brackets = status === 'mfj' ? state.brackets.mfj : state.brackets.single
  return brackets.find(b => income <= b.upTo)?.rate ?? state.ltcgRate
}

export const SORTED_STATES = Object.values(STATE_TAX_DATA).sort((a, b) =>
  a.name.localeCompare(b.name)
)
