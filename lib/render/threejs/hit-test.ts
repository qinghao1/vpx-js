// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import type * as THREE from 'three'

export const RE_CAB = /vrcab|cabinet|lockbar|pincab/i

export const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i

export function isTableHit(object: THREE.Object3D, root: THREE.Object3D): boolean {
	for (let c: any = object; c && c !== root; c = c.parent) {
		const n = String(c.name || '')
		if (RE_CAB.test(n) || RE_OUTER.test(n)) return true
		const ln = n.toLowerCase()
		if (ln.includes('playfield') || ln.includes('apron')) return true
	}
	return false
}
