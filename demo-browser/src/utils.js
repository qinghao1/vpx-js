// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
export * from './utils/candidate-resolver.js'
export * from './utils/texture-filter.js'
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
	// Decoded RGBA estimate across every map a material can carry.
	const MAP_KEYS = [
		'map',
		'emissiveMap',
		'normalMap',
		'roughnessMap',
		'metalnessMap',
		'aoMap',
		'alphaMap',
		'lightMap',
		'envMap',
	]
	root.traverse(o => {
		if (!o.isMesh || !o.material) return
		for (const m of Array.isArray(o.material) ? o.material : [o.material])
			for (const k of MAP_KEYS) {
				const t = m[k]
				if (!t?.image || seen.has(t)) continue
				seen.add(t)
				count++
				const img = t.image
				const w = img.width || 0
				const h = img.height || 0
				bytes += w && h ? w * h * 4 : 0
			}
	})
	return { texCount: count, texMemMB: (bytes / 1048576).toFixed(1) }
}
export const logMem = (log, stage) => {
	const m = performance.memory
	if (m)
		log?.(
			`[mem] ${stage}: ${(m.usedJSHeapSize / 1048576).toFixed(0)}/${(m.totalJSHeapSize / 1048576).toFixed(0)} MB`,
			'debug',
		)
}
