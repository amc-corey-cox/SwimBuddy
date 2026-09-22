# Swim Buddy

A local-first swim workout PWA for one family. Generates workouts scaled to each
swimmer's fitness and adapts them from post-swim feedback. No accounts, no telemetry,
no subscriptions, works offline at the pool.

Full spec: [`docs/spec.md`](docs/spec.md). Build order: [`docs/roadmap.md`](docs/roadmap.md).
How development is done: [`CLAUDE.md`](CLAUDE.md).

## Status

Build order step 1 of 9, plus the CI and preview machinery the later steps depend on.
The app itself is still a placeholder page — storage, parser, templates and screens
come next.

## Develop

```sh
npm install
npm run dev        # vite dev server
npm test           # vitest, headless
npm run check      # every CI gate except the browser tests
npm run test:e2e   # Playwright smoke tests (needs a browser installed)
```

`npm run check` runs lint, formatting, typecheck, unit tests with coverage, the
production build and the bundle check. The browser tests are deliberately separate,
because they need a Chromium install that CI provides and a fresh checkout does not.

Individual gates:

| Command                 | What it checks                                            |
| ----------------------- | --------------------------------------------------------- |
| `npm run lint`          | ESLint, including the `src/core/` purity rules            |
| `npm run format:check`  | Prettier (`npm run format` fixes)                         |
| `npm run typecheck`     | `tsc -b` across the app, build-tooling and e2e projects   |
| `npm run test:coverage` | Unit tests with coverage thresholds                       |
| `npm run test:e2e`      | Playwright smoke tests against the real built page        |
| `npm run check:bundle`  | Asserts no fixture data reached the production bundle     |
| `npm run schema:setup`  | Builds the LinkML toolchain and applies `schema/patches/` |
| `npm run schema:gen`    | Regenerates the model from `schema/swimbuddy.yaml`        |

All rule-based logic lives in `src/core/` as pure functions and must be covered by
tests runnable with `npm test` — development happens in a cloud sandbox with no device
access, so correctness cannot rely on a browser.

TypeScript is pinned to `~6.0.3` on purpose: `typescript-eslint` caps its peer range
at `<6.1.0`, so a float to 6.1 would break linting. Raise the pin only once the lint
tooling supports the newer version.

ESLint enforces that boundary rather than trusting it: `src/core/` may not reference
the DOM, IndexedDB or `localStorage`, and may not import `src/storage/` or `src/ui/`.

### Browser tests in a sandbox

If your environment ships a preinstalled Chromium whose revision does not match the
installed Playwright, point at it instead of downloading a second copy:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

CI installs the matching browser and leaves that variable unset.

## Synthetic data

`src/fixtures/` holds three invented swimmers, three templates and about eight weeks
of session history. The names and times are made up — this repository is public, so
no real family data lives in it.

Fixtures are pure and deterministic: every record derives from a reference date passed
in by the caller, and nothing calls `Date.now()`. They serve as the parser's test
corpus, as the history the adaptation rules will be tested against, and as the seed
data that makes PR previews show a populated app. See
[`src/fixtures/README.md`](src/fixtures/README.md).

## Storage

All persistence goes through `src/storage/`, which owns the only `idb` import in
the codebase. Records carry a UUIDv4, `created_at`/`updated_at` and a `deleted`
tombstone; deletes are soft so a future sync can propagate them. Schema changes go
through an ordered migration list, and the selector that decides which migrations
to run is a pure function so it can be tested without a database.

Unit tests run against `fake-indexeddb`; the app also opens the store and seeds on
startup so the Playwright suite proves IndexedDB works on a real browser engine.
See [`src/storage/README.md`](src/storage/README.md).

## CI

Every pull request runs lint, formatting, typecheck, unit tests with coverage
thresholds, a production build, the bundle check, and Playwright smoke tests in a real
browser at phone and desktop viewports. The browser tests assert the page renders with
no console errors and no failed requests — that is the check that catches a blank
page, which no unit test can.

## Previews and deploys

Both publish to the `gh-pages` branch, which serves:

```
/                 production, deployed from main
/pr-12/           live preview of PR #12
/pr-12/screenshots/
```

Every pull request from this repository gets a preview at
`https://amc-corey-cox.github.io/SwimBuddy/pr-<number>/`, linked from a comment on the
PR along with phone and desktop screenshots. It updates on every push and is removed
when the PR closes. Pull requests from forks are skipped, because a fork's token
cannot publish.

Previews are built with `VITE_SHOW_FIXTURES=true` so they render the synthetic store.
Production builds leave the flag unset, and the fixtures are tree-shaken away —
`npm run check:bundle` fails the build if they ever survive.

Publishing is plain `git` in [`scripts/publish-to-gh-pages.sh`](scripts/publish-to-gh-pages.sh),
so there is no third-party action in the deploy path. Production deploys preserve
`pr-*` directories; preview deploys touch only their own.

### One-time setup

Under **Settings → Pages → Build and deployment**, set **Source: Deploy from a
branch**, branch **`gh-pages`**, folder **`/ (root)`**.

The `gh-pages` branch is created by the first deploy or preview run, so let one run
before changing the setting. Repo settings are not available in the GitHub mobile app —
use a browser.

Vite's `base` is `/SwimBuddy/` to match the project Pages URL; `BASE_PATH` overrides it
(previews use it, and a custom domain would too).

## License

[AGPLv3](LICENSE). Every screen links back to this repository so the §13 network-use
obligation holds for any future hosted instance — a Playwright test asserts that link
is present.
