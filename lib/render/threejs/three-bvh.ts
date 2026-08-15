// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

type BvhGeometry = BufferGeometry & {
	boundsTree?: unknown
	computeBoundsTree?: (opts?: unknown) => void
	disposeBoundsTree?: () => void
}

let installed = false

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

export function buildBvhForGeometry(geom: BufferGeometry, force = false): void {
	installBvh()
	const g = geom as BvhGeometry
	if (g.boundsTree) return
	const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3
	if (!force && tris < 200) return
	try {
		g.computeBoundsTree?.({ includeInstances: true } as any)
	} catch {}
}

export function buildBvhForNode(root: { traverse(cb: (o: unknown) => void): void }, forceButton = false): number {
	installBvh()
	let built = 0
	root.traverse((o: unknown) => {
		const m = o as {
			isMesh?: boolean
			isInstancedMesh?: boolean
			isBatchedMesh?: boolean
			geometry?: BufferGeometry
			userData?: Record<string, unknown>
			name?: string
		}
		if ((!m.isMesh && !m.isInstancedMesh && !m.isBatchedMesh) || !m.geometry) return
		const isButton = !!(
			m.userData?.isCabinetButton ||
			(m.name && /button|coin|plunger|tour|start|fire/i.test(m.name))
		)
		if (isButton) {
			buildBvhForGeometry(m.geometry, true)
			if ((m.geometry as BvhGeometry).boundsTree) built++
			return
		}
		const g = m.geometry as BvhGeometry
		if (g.boundsTree) return
		buildBvhForGeometry(m.geometry, forceButton)
		if ((m.geometry as BvhGeometry).boundsTree) built++
	})
	return built
}

export function buildBvhIdle(
	root: { traverse(cb: (o: unknown) => void): void },
	chunkSize = 30,
	forceButton = true,
): void {
	installBvh()
	const queue: BvhGeometry[] = []
	root.traverse((o: unknown) => {
		const m = o as {
			isMesh?: boolean
			isInstancedMesh?: boolean
			isBatchedMesh?: boolean
			geometry?: BvhGeometry
			userData?: Record<string, unknown>
			name?: string
		}
		if ((m.isMesh || m.isInstancedMesh || m.isBatchedMesh) && m.geometry && !m.geometry.boundsTree) {
			const isButton = !!(
				m.userData?.isCabinetButton ||
				(m.name && /button|coin|plunger|tour|start|fire/i.test(m.name))
			)
			if (isButton) {
				try {
					;(m.geometry as BvhGeometry).computeBoundsTree?.({ includeInstances: true } as any)
				} catch {}
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
				if (geom) buildBvhForGeometry(geom)
			}
		}
		if (idx < queue.length) schedule(step)
	}
	schedule(step as IdleRequestCallback)
}
