// Approximate annualized volatility (%) for major symbols.
// Based on typical 1-year realized vol; these are planning estimates, not live data.
// Methodology: rounded to nearest integer, reflecting broad historical behavior.
// Default fallback for unknown tickers: 22% (large-cap average).

const TICKER_VOL: Record<string, number> = {
  // ── Broad market ETFs ────────────────────────────────────────────────────────
  SPY: 15, VOO: 15, IVV: 15, VTI: 15, ITOT: 15, SCHB: 15,
  QQQ: 20, QQQM: 20,
  DIA: 14,  // Dow Jones
  IWM: 20,  // Russell 2000
  VEA: 14, EFA: 14, SCHF: 14,  // Developed international
  VWO: 18, EEM: 18,             // Emerging markets

  // ── Sector ETFs ──────────────────────────────────────────────────────────────
  XLK: 22,  // Tech
  XLF: 20,  // Financials
  XLV: 14,  // Health care
  XLE: 25,  // Energy
  XLI: 16,  // Industrials
  XLP: 12,  // Consumer staples
  XLU: 14,  // Utilities
  XLRE: 18, // Real estate
  XLC: 20,  // Communication services
  XLY: 22,  // Consumer discretionary
  XLB: 18,  // Materials
  VGT: 22,  // Vanguard tech
  VHT: 14,  // Vanguard health
  VFH: 20,  // Vanguard financials
  VDE: 25,  // Vanguard energy

  // ── Fixed income & alternatives ──────────────────────────────────────────────
  AGG: 5, BND: 5, SCHZ: 5,   // Aggregate bonds — very low vol
  TLT: 14, TLH: 12, IEF: 8,  // Treasuries (TLT has duration risk)
  HYG: 8, JNK: 8,             // High yield
  GLD: 13, IAU: 13,           // Gold
  SLV: 24,                    // Silver — more volatile than gold

  // ── Mega-cap tech ────────────────────────────────────────────────────────────
  AAPL: 24,
  MSFT: 23,
  NVDA: 50,   // Elevated — AI hype cycle, wide daily swings
  GOOG: 24, GOOGL: 24,
  AMZN: 28,
  META: 34,
  TSLA: 55,   // Historically the most volatile mega-cap
  AVGO: 36,
  ORCL: 26,
  ADBE: 30,
  CRM: 30,
  AMD: 48,
  INTC: 30,
  QCOM: 28,
  TXN: 22,
  AMAT: 38,
  LRCX: 38,
  KLAC: 36,
  MU: 42,
  MRVL: 42,
  NOW: 30,
  PANW: 36,
  CRWD: 38,
  FTNT: 28,
  ZS: 38,
  SNOW: 50,
  DDOG: 48,
  NET: 48,
  PLTR: 52,
  UBER: 38,
  LYFT: 55,
  ABNB: 40,
  COIN: 70,   // Crypto-correlated
  MSTR: 80,   // Leveraged BTC proxy
  APP: 50,
  RBLX: 55,
  RIVN: 65,
  LCID: 75,

  // ── Communication services ───────────────────────────────────────────────────
  NFLX: 34,
  DIS: 24,
  CMCSA: 20,
  TMUS: 20,
  VZ: 16,
  T: 16,
  CHTR: 26,
  WBD: 40,
  PARA: 40,
  FOX: 22, FOXA: 22,
  SNAP: 70,
  PINS: 48,
  RDDT: 60,
  SPOT: 42,
  TTD: 50,

  // ── Consumer discretionary ───────────────────────────────────────────────────
  HD: 20,
  LOW: 20,
  NKE: 24,
  SBUX: 24,
  MCD: 16,
  YUM: 16,
  CMG: 28,
  LULU: 36,
  ROST: 18,
  TJX: 16,
  BKNG: 28,
  MAR: 24,
  HLT: 24,
  MGM: 34,
  WYNN: 36,
  LVS: 32,
  F: 30,
  GM: 28,
  DKNG: 55,
  EBAY: 24,
  ETSY: 45,

  // ── Consumer staples ─────────────────────────────────────────────────────────
  WMT: 16,
  COST: 18,
  PG: 14,
  KO: 13,
  PEP: 13,
  PM: 14,
  MO: 16,
  CL: 14,
  MDLZ: 14,
  KHC: 18,
  GIS: 13,
  K: 13,
  CAG: 16,
  CPB: 14,
  HSY: 16,
  SJM: 14,
  MKC: 14,
  CLX: 14,
  CHD: 14,
  EL: 22,
  COTY: 30,

  // ── Energy ───────────────────────────────────────────────────────────────────
  XOM: 22,
  CVX: 22,
  COP: 26,
  EOG: 28,
  SLB: 30,
  HAL: 35,
  BKR: 30,
  PSX: 24,
  VLO: 28,
  MPC: 28,
  OXY: 30,
  DVN: 35,
  FANG: 32,
  HES: 28,
  PXD: 28,
  KMI: 18,
  WMB: 18,
  OKE: 18,
  ET: 22,
  EPD: 16,

  // ── Financials ───────────────────────────────────────────────────────────────
  'BRK.B': 18,
  'BRK-B': 18,
  JPM: 22,
  BAC: 24,
  WFC: 24,
  GS: 26,
  MS: 26,
  C: 26,
  AXP: 24,
  V: 18,
  MA: 18,
  PYPL: 38,
  SQ: 50,
  AFRM: 70,
  COF: 26,
  DFS: 26,
  SYF: 30,
  BLK: 22,
  SCHW: 26,
  ICE: 18,
  CME: 18,
  SPGI: 20,
  MCO: 20,
  CB: 16,
  PGR: 20,
  AIG: 22,
  MET: 20,
  PRU: 22,
  USB: 22,
  PNC: 22,
  TFC: 22,
  FITB: 26,
  KEY: 28,
  RF: 28,

  // ── Health care ──────────────────────────────────────────────────────────────
  JNJ: 16,
  UNH: 20,
  LLY: 28,
  MRK: 18,
  ABBV: 20,
  PFE: 18,
  BMY: 18,
  AMGN: 20,
  GILD: 18,
  BIIB: 30,
  VRTX: 26,
  REGN: 26,
  MRNA: 55,
  BNTX: 50,
  CI: 20,
  HUM: 22,
  CVS: 20,
  MCK: 18,
  AHC: 18,
  ABC: 18,
  CAH: 18,
  TMO: 20,
  DHR: 20,
  A: 22,
  IQV: 22,
  BDX: 18,
  EW: 24,
  SYK: 20,
  MDT: 18,
  BSX: 22,
  ISRG: 24,
  ZBH: 18,
  BAX: 20,
  DGX: 18,
  LH: 18,
  IDXX: 22,
  ZTS: 20,
  DXCM: 40,
  PODD: 35,
  TNDM: 55,

  // ── Industrials ──────────────────────────────────────────────────────────────
  HON: 18,
  UPS: 18,
  FDX: 22,
  BA: 30,
  LMT: 18,
  RTX: 18,
  NOC: 18,
  GD: 18,
  GE: 26,
  MMM: 22,
  CAT: 22,
  DE: 24,
  EMR: 18,
  ETN: 22,
  ITW: 18,
  PH: 20,
  ROK: 22,
  AME: 20,
  CTAS: 18,
  WM: 14,
  RSG: 14,
  CSX: 18,
  NSC: 18,
  UNP: 18,
  CP: 20,
  CNI: 18,
  DAL: 32,
  UAL: 36,
  AAL: 40,
  LUV: 28,
  JBLU: 40,

  // ── Materials ────────────────────────────────────────────────────────────────
  LIN: 16,
  APD: 18,
  ECL: 18,
  NEM: 30,
  FCX: 38,
  NUE: 30,
  STLD: 30,
  X: 35,
  CF: 30,
  MOS: 32,
  ALB: 45,
  SQM: 40,
  MP: 55,

  // ── Real estate (REITs) ──────────────────────────────────────────────────────
  AMT: 18,
  PLD: 18,
  EQIX: 20,
  CCI: 20,
  SPG: 22,
  O: 16,
  VICI: 18,
  WPC: 16,
  PSA: 18,
  EXR: 20,
  AVB: 18,
  EQR: 16,
  ARE: 20,
  WELL: 16,
  VTR: 20,
  HST: 24,

  // ── Utilities ────────────────────────────────────────────────────────────────
  NEE: 18,
  SO: 14,
  DUK: 14,
  D: 16,
  AEP: 14,
  EXC: 16,
  XEL: 14,
  ED: 14,
  WEC: 14,
  ES: 14,
  AWK: 14,
  PCG: 22,
  EIX: 20,
  ETR: 16,
  FE: 18,
  PPL: 16,
  CNP: 16,
  AES: 24,

  // ── Popular growth / speculative ─────────────────────────────────────────────
  ARM: 55,
  SMCI: 70,
  ASTS: 75,
  LUNR: 80,
  HIMS: 65,
  RXRX: 70,
  IONQ: 80,
  QBTS: 80,
  RGTI: 85,
  DJT: 90,   // Very high — political stock
}

const DEFAULT_VOL = 22

export function getTickerVol(ticker: string): number {
  return TICKER_VOL[ticker.toUpperCase()] ?? DEFAULT_VOL
}

export function isVolKnown(ticker: string): boolean {
  return ticker.toUpperCase() in TICKER_VOL
}

export { DEFAULT_VOL }
