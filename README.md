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
│  │  ├─ config.js
│  │  ├─ util/
│  │  │  ├─ rng.js
│  │  │  ├─ math.js
│  │  │  └─ format.js
│  │  ├─ core/
│  │  │  ├─ types.js
│  │  │  ├─ state.js
│  │  │  ├─ priceModel.js
│  │  │  ├─ events.js
│  │  │  ├─ trading.js
│  │  │  ├─ risk.js
│  │  │  ├─ cycle.js
│  │  │  └─ persist.js
│  │  ├─ ui/
│  │  │  ├─ dom.js
│  │  │  ├─ table.js
│  │  │  ├─ chart.js
│  │  │  ├─ insight.js
│  │  │  ├─ newsGlobal.js
│  │  │  ├─ toast.js
│  │  │  ├─ modal.js
│  │  │  └─ hud.js
│  │  └─ test/
│  │     ├─ engine.spec.js
│  │     └─ cycle.spec.js
├─ package.json
├─ README.md
└─ .gitignore
```

## Scripts

- `npm test` - placeholder test script.

## Deployment

The root `index.html` references assets from the `src/` directory so the
game can run directly on static hosts like GitHub Pages without a build step.
