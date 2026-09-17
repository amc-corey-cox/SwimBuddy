Pure business logic: the parser, resolver and adaptation rules.

Nothing here may import the DOM or `src/storage/`. Functions take data and return
data, so the same code can run in a future sync server unchanged. `tsconfig.app.json`
enforces the browser half of this — Node globals like `process` are not in scope for
`src/` at all — but the no-storage rule is on us to keep.

Every rule-based behavior in this directory needs unit tests runnable with `npm test`;
development happens in a sandbox with no device, so correctness is never confirmed by
loading it in a browser.
