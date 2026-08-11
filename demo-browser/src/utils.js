export const $ = id => document.getElementById(id)
export const fmtBytes = n => (n < 1_048_576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
export const countObjects = root => {
	let c = 0
	root.traverse(() => c++)
	return c
}

export const computeTexMem = root => {
	let bytes = 0,
		count = 0
	const seen = new Set()
	root.traverse(o => {
		if (!o.isMesh || !o.material) return
		for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
			for (const k of ['map', 'emissiveMap', 'normalMap', 'envMap']) {
				const t = m[k]
				if (!t?.image || seen.has(t)) continue
				seen.add(t)
				count++
				const img = t.image
				const w = img.width || img.naturalWidth || 0
				const h = img.height || img.naturalHeight || 0
				bytes += w && h ? w * h * 4 : (img.data?.length ?? 0)
			}
		}
	})
	return { texCount: count, texMemMB: (bytes / 1_048_576).toFixed(1) }
}

export const logMem = (log, stage) => {
	const m = performance.memory
	if (m)
		log?.(
			`[mem] ${stage}: ${(m.usedJSHeapSize / 1_048_576).toFixed(0)}/${(m.totalJSHeapSize / 1_048_576).toFixed(0)} MB`,
			'debug',
		)
}

export const resolveVpxCandidates = ({ defaultName = null, queryParam = 'vpx' } = {}) => {
	const q = new URLSearchParams(location.search)
	let name = (q.get(queryParam) || q.get('table') || defaultName || '').trim()
	if (!name) return []
	if (/^https?:\/\//i.test(name) || name.startsWith('/@fs/')) return [name]
	if (name.includes('/') && !name.includes('@fs')) return [name, `/${name.split('/').pop()}`]
	if (!name.toLowerCase().endsWith('.vpx')) name += '.vpx'
	return [`/${name.split('/').pop()}`]
}

export const resolveRomCandidates = romParam => (romParam?.trim() ? [romParam.trim()] : [])

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
		try {
			reader.cancel()
		} catch {}
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

export const filterTextures = (table, log) => {
	const before = Object.keys(table.textures).length
	let skipped = 0
	for (const k in table.textures) {
		const name = table.textures[k].getName().toLowerCase()
		if (
			name === 'glass' ||
			name === 'glassblood' ||
			name === 'glassnormal' ||
			(name.startsWith('glass') && name.length < 20)
		) {
			table.textures[k].binary = undefined
			delete table.textures[k]
			skipped++
		}
	}
	const after = Object.keys(table.textures).length
	log?.(`[filter] Skipped ${skipped} glass kept ${after}/${before}`, 'info')
	return { before, after }
}

const ALIAS = {
	ArrowLeft: 'ShiftLeft',
	KeyA: 'ShiftLeft',
	ArrowRight: 'ShiftRight',
	KeyD: 'ShiftRight',
	Enter: 'Enter',
	NumpadEnter: 'Enter',
}
export const aliasEvent = e => {
	const code = ALIAS[e.code]
	if (!code) return null
	return { code, key: code === 'Enter' ? 'Enter' : 'Shift', ts: Date.now() }
}
