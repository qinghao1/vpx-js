// @ts-nocheck
import * as THREE from 'three'

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

export class TextureStreamer {
	constructor(viewer) {
		this.viewer = viewer
		this.streamId = 0
	}
	prioritize(table, textures, isDeferred) {
		const all = Object.values(table.textures)
		const high = all.filter(tx => !isDeferred(tx, table))
		const deferred = all.filter(tx => isDeferred(tx, table))
		high.sort((a, b) => a.width * a.height - b.width * b.height)
		deferred.sort((a, b) => a.width * a.height - b.width * b.height)
		const result = [...high, ...deferred]
		const pf = table.getPlayfieldMap()?.toLowerCase()
		if (pf) {
			const idx = result.findIndex(tx => tx.getName().toLowerCase() === pf)
			if (idx > 0) {
				const [pfTx] = result.splice(idx, 1)
				result.unshift(pfTx)
			} else if (idx === -1) {
				const best = [...result].sort((a, b) => b.width * b.height - a.width * b.height)[0]
				if (best) {
					const fIdx = result.indexOf(best)
					if (fIdx > 0) {
						const [f] = result.splice(fIdx, 1)
						result.unshift(f)
					}
				}
			}
		}
		return result
	}
	async stream(table, textures, renderApi) {
		if (!textures.length) return
		const streamId = ++this.streamId
		const total = textures.length
		let done = 0
		for (const tx of textures) {
			if (this.streamId !== streamId) return
			await renderApi.getMapGenerator().loadTexture(tx, table)
			done++
			this.viewer._setStreamProgress?.(done, total)
		}
	}
	cancel() {
		this.streamId++
	}
}
