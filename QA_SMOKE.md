# QA Smoke Checklist

## 1.1 Asset table: left alignment + compact Actions
- [ ] Table is flush left; each row ≤ 44px tall at default zoom.
- [ ] Actions fit on one line (or a popover) with no vertical growth.
- [ ] Tab/Arrow navigate rows; Enter opens popover; Esc closes it.

## 1.2 Chart: fix candlesticks, timeframes, scaling
- [ ] Line ↔ Candles toggle works for all timeframes; hourly no longer flat.
- [ ] Market Cap visible and correct to 0-decimal for large caps.
- [ ] Zoom/resample does not distort the y-axis; no exceptions in console.

## 1.3 Insider Info: visible, specific, impactful
- [ ] Buying a tip always shows the target symbol and direction in toast, Upgrades, row badge.
- [ ] The tipped asset’s next sessions show a clear directional bias.

## 1.4 Auto-Risk Tools: stop immediate triggers after "Buy Max"
- [ ] With Auto-Risk enabled, immediate Buy/Buy Max does not trigger TP/Stop at same tick.
- [ ] Trailing/hard stops, TP ladder and cap fire correctly once price actually moves.

## 2.1 Asset Insight: compress to actionable summary
- [ ] Panel height reduced; top 3 items readable without truncation.

## 2.2 Local Demand: semantic categories
- [ ] Stats card reads “Local Demand: High” (optional tooltip with number).

## 2.3 Accessibility and keyboard
- [ ] Tab order is logical; focus ring visible; contrast ≥ WCAG AA.

## 3.1 Price model parity for intraday/hourly
- [ ] Hourly line reflects small but visible moves; no flatline artifacts.

## 3.2 Options & leverage sanity
- [ ] Buy Max computes a non-zero quantity when affordable; no infinite loops.

## 3.3 Summary modal legibility
- [ ] Summary is scannable; winners/losers obvious; next-TP column present.

## 4 Persistence, save/versioning, and resets
- [ ] Save/Load round-trip restores session with no loss of risk/insider state.

## 5 Styling consistency
- [ ] Visual balance across panels; no card looks “off grid”.

## 6 QA, telemetry, and docs
- [ ] Console debug toggle shows last auto-risk rule and last event for selected asset.
- [ ] All tests pass locally; README explains v1 clearly.
