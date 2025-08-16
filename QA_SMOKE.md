# QA Smoke Checklist

## Single screen trading flow
- [ ] Layout shows market left, chart center, portfolio and news right without scrolling on 1366×768.
- [ ] Selecting a row updates chart, details, and news for that asset.
- [ ] Clicking Buy on the first row creates a position visible in Portfolio.
- [ ] Arrow keys move selection; Enter buys; Shift+Enter sells; Esc clears highlight.

## Tests
- [ ] `npm test` passes.
