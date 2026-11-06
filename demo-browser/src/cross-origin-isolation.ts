// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const RELOADED = 'vpx:coi-reloaded'

/**
 * Makes the page cross-origin isolated on a static host that cannot send
 * COOP/COEP (builds with VITE_COI_SW=1, i.e. GitHub Pages): registers the
 * header-adding service worker (coi-sw.js) and reloads once so the page comes
 * back under it. Hosts that send the headers themselves never get here.
 * Resolves when isolated; never resolves while the page reloads; resolves
 * false when isolation is unavailable (the engine then reports why it cannot
 * start).
 */
export async function crossOriginIsolate(): Promise<boolean> {
	if (crossOriginIsolated) {
		sessionStorage.removeItem(RELOADED)
		return true
	}
	// One reload only: a page still not isolated after it never will be.
	if (!navigator.serviceWorker || sessionStorage.getItem(RELOADED)) return false
	await navigator.serviceWorker.register('coi-sw.js')
	await navigator.serviceWorker.ready
	sessionStorage.setItem(RELOADED, '1')
	location.reload()
	return new Promise(() => {})
}
