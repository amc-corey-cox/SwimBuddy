import type { Plugin } from 'vite'

/**
 * Emits a service worker that precaches the built app.
 *
 * Hand-rolled rather than pulled from a plugin: the spec's offline requirement is
 * "the pool has no signal", which is a precache of a handful of files and nothing
 * more. Workbox would be a larger build dependency than the thing it generates.
 *
 * The precache list is written at build time from the actual bundle, so a renamed
 * hashed asset cannot be missed.
 */

/** Files copied from public/ that the app needs offline. */
const STATIC_ASSETS = [
  'favicon.svg',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
]

export function serviceWorkerPlugin({ base = '/' }: { base?: string } = {}): Plugin {
  return {
    name: 'swim-buddy-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle).filter(
        (name) => !name.endsWith('.map') && !name.endsWith('.ts'),
      )
      const urls = [...emitted, ...STATIC_ASSETS].map((name) => `${base}${name}`)
      // The start URL is what a launcher opens, and it is not a file name.
      urls.push(base)

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source(urls) })
    },
  }
}

function source(urls: string[]): string {
  return `/* Generated at build time — see scripts/service-worker-plugin.ts. */
const CACHE = 'swim-buddy-${Date.now().toString(36)}'
const PRECACHE = ${JSON.stringify([...new Set(urls)], null, 2)}

// A static host may vary responses on Accept-Encoding, and a replayed request
// does not always carry identical headers. Honouring Vary here means a cached
// asset that is plainly there still misses, and the app fails offline for want of
// a header nobody set deliberately.
const MATCH = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  // One cache per build. Dropping the others on activate is what stops an old
  // shell being served next to new assets.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // A navigation always gets the app shell: this is one page, and the pool has no
  // signal to fetch a different one with.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(${JSON.stringify(urls[urls.length - 1] ?? '/')}, MATCH).then((hit) => hit ?? fetch(request)),
    )
    return
  }

  event.respondWith(
    caches.match(request, MATCH).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          // Runtime additions are best effort; an opaque or failed response is
          // simply not cached rather than poisoning the shell.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
`
}
