# Swim Buddy

A local-first swim workout PWA for one family. Generates workouts scaled to each
swimmer's fitness and adapts them from post-swim feedback. No accounts, no telemetry,
no subscriptions, works offline at the pool.

Full spec and build order: [`CLAUDE.md`](CLAUDE.md).

## Status

Build order step 1 of 9: repo skeleton. The app is a placeholder page — storage,
parser, templates and screens come next.

## Develop

```sh
npm install
npm run dev        # vite dev server
npm test           # vitest, headless
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
```

All rule-based logic lives in `src/core/` as pure functions (no DOM, no storage
imports) and must be covered by tests runnable with `npm test` — development happens
in a cloud sandbox with no device access, so correctness cannot rely on a browser.

## Deploy

Pushes to `main` build and publish to GitHub Pages via
`.github/workflows/deploy.yml`. Enable it once under **Settings → Pages → Build and
deployment → Source: GitHub Actions**.

The site is served from `https://amc-corey-cox.github.io/SwimBuddy/`, so the Vite
`base` is `/SwimBuddy/`. Set `BASE_PATH` at build time to override it (custom domain).

## License

[AGPLv3](LICENSE). Every screen links back to this repository so the §13 network-use
obligation holds for any future hosted instance.
