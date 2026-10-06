# capital-gains-optimizer

Decide whether to sell a stock lot now (short-term gain) or hold it until it qualifies as a long-term gain.
Runs entirely in the browser; positions are stored in `localStorage` and never leave the device.

```sh
npm install
npm run dev    # http://localhost:5173
npm test       # tax engine, demo data and CSV import tests
npm run build
```

## How the sell-or-wait math works

For each lot the app compares two choices:

- **Sell now:** proceeds minus short-term tax on the gain.
- **Hold to the long-term date:** proceeds at the future price minus long-term tax.

Taxes are computed by stacking the gain on top of the taxable income you enter, so a large gain that crosses
brackets (or the NIIT threshold) is taxed correctly rather than at a single marginal rate. Federal brackets are
for 2026 (Rev. Proc. 2025-32). State rates are 2025 figures; flat-rate entries use the state's top rate.

- **Break-even price:** the price on the long-term date at which both choices net the same after tax.
- **Chance waiting loses:** P(price on the long-term date < break-even). The price is modeled as a driftless
  lognormal random walk with the stock's annualized volatility. Zero drift means the app makes no market forecast.
- **Expected gain from waiting / expected shortfall:** the average after-tax advantage of waiting, and the average
  amount by which waiting loses, under the same model.
- **Risk rating:** expected upside ÷ expected downside of waiting. High risk is below 1.25×, low risk is 2× or more.

Known simplifications: each lot is analyzed on its own; losses are assumed to have no tax value; taxable income
stands in for MAGI when computing NIIT; next year's brackets are assumed equal to this year's; and HOH/MFS use
the single schedule for bracketed states.

## Demo mode (share without exposing your money)

Use the selector in the header:

- **Anonymized** keeps your portfolio's shape (number of lots, which are short- or long-term, gain/loss pattern,
  relative volatility) but rescales share counts, perturbs prices, dates and income, and swaps tickers for
  invented companies with similar volatility.
- **Sample portfolio** is an invented portfolio: employer RSUs with quarterly vests plus several brokerage holdings.

**↻ Reshuffle** generates a new random version. Demo mode is read-only and never modifies your saved data.
Opening the app with `?demo` in the URL starts in the sample portfolio, which is useful for shared links.
