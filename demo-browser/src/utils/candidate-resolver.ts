// @ts-nocheck
export const resolveVpxCandidates = ({ defaultName = null, queryParam = 'vpx' } = {}) => {
	const q = new URLSearchParams(location.search)
	let name = (q.get(queryParam) || q.get('table') || defaultName || '').trim()
	if (!name) return []
	if (/^https?:\/\//i.test(name) || name.startsWith('/@fs/')) return [name]
	if (name.includes('/') && !name.includes('@fs')) return [name, `/${name.split('/').pop()}`]
	if (!name.toLowerCase().endsWith('.vpx')) name += '.vpx'
	return [`/${name.split('/').pop()}`]
}

export const resolveRomCandidates = (romParam) => (romParam?.trim() ? [romParam.trim()] : [])

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
		try { reader.cancel() } catch {}
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
	for (const c of chunks) { out.set(c, off); off += c.length }
	return out
}
