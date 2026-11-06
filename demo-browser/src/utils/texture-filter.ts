// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// @ts-nocheck
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
