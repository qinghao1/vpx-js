// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const RELOADED = 'vpx:coi-reloaded'

/**
 * Makes the page cross-origin isolated on a static host that cannot send
 * COOP/COEP (builds with VITE_COI_SW=1, i.e. GitHub Pages): registers the
 * header-adding service worker (coi-sw.js) and reloads once so the page comes
 * back under it. Hosts that send the headers themselves never get here.
 * Resolves when isolated; never resolves while the page reloads. A spent
 * reload budget only sticks while a worker registration is still live — with
 * no live worker the budget is dropped and the dance runs again (the worker
 * may have been evicted or unregistered). Resolves false when isolation is
 * unavailable; the caller must surface that instead of booting an app whose
 * engine can never start. The failure reason distinguishes builds:
 * 'unsupported' means service workers cannot exist here at all, 'failed'
 * means the dance ran but the page stayed unisolated, 'cert-error' means
 * the worker script fetch failed TLS validation (broken domain certificate).
 */
export type IsolationResult = true | 'unsupported' | 'failed' | 'cert-error'
export async function crossOriginIsolate(): Promise<IsolationResult> {
	try {
		if (crossOriginIsolated) {
			sessionStorage.removeItem(RELOADED)
			return true
		}
		if (!navigator.serviceWorker) return 'unsupported'
		const existing = await navigator.serviceWorker.getRegistration().catch(() => undefined)
		if (!existing?.active && !existing?.installing && !existing?.waiting) sessionStorage.removeItem(RELOADED)
		// One reload only: a page still not isolated after it never will be.
		if (sessionStorage.getItem(RELOADED)) return 'failed'
		const registration = await navigator.serviceWorker.register('coi-sw.js')
		if (!registration.active && !registration.installing && !registration.waiting) return 'failed'
		await navigator.serviceWorker.ready
		sessionStorage.setItem(RELOADED, '1')
		location.reload()
		return new Promise<IsolationResult>(() => {})
	} catch (error) {
		console.warn('[coi] cross-origin isolation unavailable', error)
		return /ssl|certificate/i.test(String(error)) ? 'cert-error' : 'failed'
	}
}

/**
 * Blocking notice for VITE_COI_SW builds that never became isolated: the
 * threaded engine cannot start there, so say so up front with a working
 * reload instead of failing later at Play time with a console-only error.
 */
export function showIsolationNotice(reason: Exclude<IsolationResult, true>): void {
	const insecure = location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
	const detail = insecure
		? 'You are browsing over http:// — service workers (and the engine) need https://. Open the https:// address instead.'
		: reason === 'unsupported'
			? 'This browser has service workers disabled or does not support them — use Chrome or Edge.'
			: reason === 'cert-error'
				? 'The site’s HTTPS certificate is invalid, so the browser refuses the isolation worker. Fix the domain certificate (Pages settings → Custom domain), then reload — reloading cannot help until then.'
				: 'Reload to retry. If this persists, close this site’s other tabs and check that service workers are enabled.'
	const box = document.createElement('div')
	box.setAttribute('role', 'alert')
	box.style.cssText =
		'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:10px 16px;' +
		'background:#3a1414;color:#ffd9d9;font:13px/1.5 system-ui,sans-serif;' +
		'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap'
	const text = document.createElement('span')
	text.textContent = `Engine unavailable: this page is not cross-origin isolated. ${detail}`
	box.append(text)
	// A reload can only help the transient case; the others need a settings
	// or browser change first.
	if (reason === 'failed' && !insecure) {
		const retry = document.createElement('button')
		retry.textContent = 'Reload'
		retry.style.cssText = 'padding:4px 14px;cursor:pointer'
		retry.addEventListener('click', () => {
			sessionStorage.removeItem(RELOADED)
			location.reload()
		})
		box.append(retry)
	}
	document.body.prepend(box)
}
