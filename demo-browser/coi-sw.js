// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Cross-origin isolation for static hosts that cannot send headers (GitHub
// Pages): adds COOP/COEP to every response, so the page gets the
// SharedArrayBuffer the threaded engine needs. Emitted only into builds with
// VITE_COI_SW=1 (src/cross-origin-isolation.ts registers it). Headers only,
// no caching: HTTP revalidation keeps the engine fresh. Same approach as
// upstream vpinball's apps/web/sw.js.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
	const { request } = event
	// Chrome rejects only-if-cached outside same-origin mode; let it through untouched.
	if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return
	event.respondWith(fetch(request).then(isolate))
})

function isolate(response) {
	// Opaque responses (status 0) have immutable headers.
	if (response.status === 0) return response
	const headers = new Headers(response.headers)
	headers.set('Cross-Origin-Opener-Policy', 'same-origin')
	headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
