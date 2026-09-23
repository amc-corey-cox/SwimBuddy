/* Generated at build time — see scripts/service-worker-plugin.ts. */
const CACHE = 'swim-buddy-mudk1ztz'
const PRECACHE = [
  "/SwimBuddy/pr-12/assets/index-CWI8L_qE.js",
  "/SwimBuddy/pr-12/assets/app-ByqTPptI.js",
  "/SwimBuddy/pr-12/assets/modifiers-oTsBHyV2.js",
  "/SwimBuddy/pr-12/assets/storage-DupahdBa.js",
  "/SwimBuddy/pr-12/assets/index-cEmeqCrz.css",
  "/SwimBuddy/pr-12/favicon.svg",
  "/SwimBuddy/pr-12/manifest.webmanifest",
  "/SwimBuddy/pr-12/icon-192.png",
  "/SwimBuddy/pr-12/icon-512.png",
  "/SwimBuddy/pr-12/icon-512-maskable.png",
  "/SwimBuddy/pr-12/"
]

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
      caches.match("/SwimBuddy/pr-12/", MATCH).then((hit) => hit ?? fetch(request)),
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
