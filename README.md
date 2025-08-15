# To-The-Moon-Trading-Sim

HTML/Javascript trading sim game.

## Project Structure

```
.
├─ index.html
├─ docs/
│  ├─ versions/
│  ├─ context.md
│  ├─ goals.md
│  └─ ideas.md
├─ src/
│  ├─ index.html
│  ├─ css/
│  │  └─ main.css
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ gameLoop.js
│  │  ├─ persistence.js
│  │  ├─ config.js
│  │  ├─ util/
│  │  │  ├─ rng.js
│  │  │  ├─ math.js
│  │  │  └─ format.js
│  │  ├─ core/
│  │  │  ├─ types.js
│  │  │  ├─ state.js
│  │  │  ├─ store.js
│  │  │  ├─ priceModel.js
│  │  │  ├─ events.js
│  │  │  ├─ trading.js
│  │  │  ├─ risk.js
│  │  │  ├─ cycle.js
│  │  │  └─ persist.js
│  │  ├─ ui/
│  │  │  ├─ init.js
│  │  │  ├─ table.js
│  │  │  ├─ chart.js
│  │  │  ├─ insight.js
│  │  │  ├─ newsGlobal.js
│  │  │  ├─ toast.js
│  │  │  ├─ modal.js
│  │  │  ├─ hud.js
│  │  │  ├─ newsAssets.js
│  │  │  ├─ risktools.js
│  │  │  ├─ portfolio.js
│  │  │  └─ upgrades.js
│  │  └─ test/
│  │     ├─ engine.spec.js
│  │     ├─ cycle.spec.js
│  │     ├─ margin.spec.js
│  │     ├─ insider.spec.js
│  │     ├─ options.spec.js
│  │     ├─ crypto.spec.js
│  │     ├─ hud.test.js
│  │     └─ persist.test.js
├─ package.json
├─ README.md
└─ .gitignore
```

## Scripts

- `npm test` - run jest test suite.
- `npm run lint` - run ESLint.

## Deployment

The root `index.html` references assets from the `src/` directory so the
game can run directly on static hosts like GitHub Pages without a build step.
