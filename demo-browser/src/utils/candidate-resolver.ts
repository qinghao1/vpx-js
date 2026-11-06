// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// @ts-nocheck
export const resolveVpxCandidates = vpx => {
	let name = (vpx || '').trim()
	if (!name) return []
	if (/^https?:\/\//i.test(name) || name.startsWith('/@fs/')) return [name]
	if (!name.toLowerCase().endsWith('.vpx')) name += '.vpx'
	// Page-relative so subpath deploys (GitHub Pages project sites) resolve
	// inside the deploy instead of at the domain root. An explicitly
	// server-absolute name keeps its leading slash: the author opted out.
	if (name.startsWith('/')) return [name]
	if (name.includes('/')) return [name, name.split('/').pop()]
	return [name]
}

/**
 * Download a file's bytes, reporting `{ received, total }` per chunk.
 * `total` is undefined when the server omits content-length: callers must
 * show bytes, never a fake percent. Aborting `signal` aborts the body
 * stream too. An HTML page is rejected: dev servers and SPA hosts answer a
 * missing file with their index.html and a 200.
 */
export const fetchWithProgress = async (url, onProgress, { signal } = {}) => {
	const res = await fetch(url, { cache: 'no-store', signal })
	if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
	if (res.headers.get('content-type')?.includes('text/html')) throw new Error(`${url} is an HTML page, not a file`)
	if (!res.body) {
		const b = await res.arrayBuffer()
		onProgress?.({ received: b.byteLength, total: b.byteLength })
		return new Uint8Array(b)
	}
	const len = Number(res.headers.get('content-length') || 0) || undefined
	const reader = res.body.getReader()
	const chunks = []
	let received = 0
	const report = () => onProgress?.({ received, total: len })
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		chunks.push(value)
		received += value.length
		report()
	}
	report()
	if (chunks.length === 1) return chunks[0]
	const out = new Uint8Array(received)
	let off = 0
	for (const c of chunks) {
		out.set(c, off)
		off += c.length
	}
	return out
}
