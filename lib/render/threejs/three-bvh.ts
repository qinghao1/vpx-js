// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { type CustomMaterialUserData, isButtonLike } from './scene-classify.js'

type BvhGeometry = BufferGeometry & {
	boundsTree?: unknown
	computeBoundsTree?: (opts?: unknown) => void
	disposeBoundsTree?: () => void
}

let installed = false

// Patch the three.js prototypes once so every geometry can grow a BVH on demand.
export function installBvh(): void {
	if (installed) return
	;(BufferGeometry.prototype as unknown as Record<string, unknown>).computeBoundsTree ??=
		computeBoundsTree as unknown as never
	;(BufferGeometry.prototype as unknown as Record<string, unknown>).disposeBoundsTree ??=
		disposeBoundsTree as unknown as never
	if ((Mesh.prototype as unknown as Record<string, unknown>).raycast !== acceleratedRaycast) {
		;(Mesh.prototype as unknown as Record<string, unknown>).raycast = acceleratedRaycast as unknown as never
	}
	installed = true
}

// Idle-time BVH rollout: 30 geometries or ~8ms per slice so first paint isn't blocked.
export function buildBvhIdle(root: { traverse(cb: (o: unknown) => void): void }, chunkSize = 30): void {
	installBvh()
	const queue: BvhGeometry[] = []
	root.traverse((o: unknown) => {
		const m = o as {
			isMesh?: boolean
			isInstancedMesh?: boolean
			isBatchedMesh?: boolean
			geometry?: BvhGeometry
			userData?: CustomMaterialUserData
			name?: string
		}
		if ((m.isMesh || m.isInstancedMesh || m.isBatchedMesh) && m.geometry && !m.geometry.boundsTree) {
			// Buttons build eagerly (tiny but raycast often); the rest queue below.
			if (isButtonLike(m.name, m.userData)) {
				m.geometry.computeBoundsTree?.({})
				return
			}
			queue.push(m.geometry)
		}
	})
	if (!queue.length) return
	let idx = 0
	const schedule = (cb: IdleRequestCallback): void => {
		if (typeof requestIdleCallback !== 'undefined')
			(requestIdleCallback as unknown as (c: IdleRequestCallback, o?: unknown) => void)(cb, { timeout: 200 })
		else
			setTimeout(
				() =>
					(cb as unknown as (d: IdleDeadline) => void)({
						didTimeout: false,
						timeRemaining: () => 8,
					} as unknown as IdleDeadline),
				16,
			)
	}
	const step: IdleRequestCallback = deadline => {
		const start = performance.now()
		while (idx < queue.length) {
			if (deadline.timeRemaining() <= 1) break
			if (performance.now() - start > 8) break
			for (let n = 0; n < chunkSize && idx < queue.length; n++, idx++) {
				const geom = queue[idx]
				if (!geom) continue
				// Skip tiny geometries: BVH build cost exceeds raycast savings below 200 tris.
				const tris = geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3
				if (tris >= 200) geom.computeBoundsTree?.({})
			}
		}
		if (idx < queue.length) schedule(step)
	}
	schedule(step as IdleRequestCallback)
}
