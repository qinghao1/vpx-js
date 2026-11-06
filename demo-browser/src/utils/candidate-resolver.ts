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

export const fetchWithProgress = async (url, onProgress, opts = {}) => {
	const signal = opts?.signal
	if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
	const res = await fetch(url, { cache: 'no-store', signal })
	if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
	if (!res.body) {
		const b = await res.arrayBuffer()
		onProgress?.(1)
		return new Uint8Array(b)
	}
	const len = Number(res.headers.get('content-length') || 0)
	const reader = res.body.getReader()
	const chunks = []
	let received = 0
	const onAbort = () => {
		reader.cancel()
	}
	if (signal) signal.addEventListener('abort', onAbort, { once: true })
	try {
		while (true) {
			if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
			const { done, value } = await reader.read()
			if (done) break
			if (!value) continue
			chunks.push(value)
			received += value.length
			if (len) onProgress?.(Math.min(received / len, 1))
			else onProgress?.(Math.min(received / (2 * 1024 * 1024), 0.99))
		}
	} finally {
		if (signal) signal.removeEventListener('abort', onAbort)
	}
	onProgress?.(1)
	if (chunks.length === 1) return chunks[0]
	const out = new Uint8Array(received)
	let off = 0
	for (const c of chunks) {
		out.set(c, off)
		off += c.length
	}
	return out
}
