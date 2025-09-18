# Mission Brief — To The Moon Command Deck

## Vision
* Build **To The Moon** as an MMORTS-style roguelite trading sim where the market is one front in a larger galactic campaign.
* Every feature should feel like a subsystem on a capital ship bridge: compact, legible, and always on-screen within a fixed viewport.
* Future content modules (raids, logistics, research, guild contracts) must be able to dock into the dashboard without breaking the command deck frame.

## Experience Pillars
1. **Strategic Clarity** — Surface the state of the run, active effects, and tactical options at a glance. Priority information belongs in the center command column or HUD badges.
2. **Living Economy** — Treat markets, events, upgrades, and meta progress as interlocking resource loops. New mechanics should reinforce the trading fantasy rather than fight it.
3. **Operable Style** — Lean into cosmic-industrial styling: midnight blues, aurora highlights, luminous gold accents, and notched panels reminiscent of sci-fi strategy UIs.

## UI/UX Guidelines
* Keep the dashboard anchored to the viewport height. Use interior scroll regions for overflow; never force the page to scroll.
* Preserve the three-column layout:
  * **Port Wing (left)** — Market radar, feeds, and other acquisition tools.
  * **Command Spine (center)** — Asset detail, charts, trade execution, tactical overlays.
  * **Starboard Wing (right)** — Events, upgrades, meta progression, and limited-time operations.
* The top HUD is a status ribbon. Metrics should read like instrument gauges; action buttons behave like an RTS command bar (uppercase labels, generous hit areas).
* Panels sit on a shared frame. When adding new modules, match the bevelled borders, internal glows, and layered lighting introduced in `css/styles.css`.
* Favor gradients, holographic glows, and subtle motion (e.g., progress bars) over flat blocks. Use `var(--color-accent)` for premium actions and `var(--color-highlight)` for informational cues.
* Maintain strong contrast and readability. When experimenting with palette shifts, check legibility against the starfield background.

## Implementation Notes
* Align new layout work with the existing CSS utility variables (`--space-*`, `--radius-*`, `--color-*`). Add tokens near the top of `css/styles.css` if the system needs to grow.
* Use CSS grid + flexbox combinations to keep components responsive without breaking the fixed-frame illusion. Test at 1280×720 and tablet breakpoints.
* JS modules can assume DOM structure stability, but avoid moving the primary panels out of the grid without updating this playbook.
* When introducing new HUD metrics or buttons, follow the command-deck styling (uppercase text, pill buttons, layered glows) for cohesion.
* Document any new genre conventions or economy loops here so future agents understand how mechanics should interlock.
